/**
 * ネットワークタブ（プロキシ + OpenVPN 接続）。
 * v0.43.0 (F-042): 一般タブから分離して新設。
 */
import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { existsSync } from 'fs';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { getOpenVpnController } from '../features/network/openvpn';
import { refreshVpnToggles } from '../features/network/vpn-toggle';
import type { OpenVpnSettings, OpenVpnStatus } from '../features/network/types';

/** v0.43.8: OpenVPN Community 公式ダウンロードページ */
const OPENVPN_DOWNLOAD_URL = 'https://openvpn.net/community-downloads/';

/**
 * v0.43.8: バイナリパスを解決する（openvpn.ts の start() と同一規則）。
 * 空欄時は Windows = Program Files の既定パス、その他 = PATH 上の `openvpn`。
 */
function resolveBinaryPath(configured: string): string {
  if (configured) return configured;
  return process.platform === 'win32'
    ? 'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe'
    : 'openvpn';
}

/**
 * v0.43.8: OpenVPN のインストール有無を判定する。
 * 絶対パス指定（既定パス含む）のみ実在チェックし、PATH 解決に委ねる値は
 * 判定不能のため「インストール済み」として扱う（誤警告を避ける）。
 */
function isOpenVpnInstalled(configured: string): boolean {
  const p = resolveBinaryPath(configured);
  if (!/[\\/]/.test(p)) return true;
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

export function renderNetworkTab(
  _app: App,
  containerEl: HTMLElement,
  store: ConfigStore,
): void {
  const s = getLocaleStrings(getUILanguage());
  const controller = getOpenVpnController();

  const draw = (): void => {
    containerEl.empty();
    const cfg = store.load();

    containerEl.createEl('h2', { text: s.tabNetwork });
    containerEl.createEl('p', {
      text: s.networkNoticeDesktopOnly,
      cls: 'setting-item-description',
    });

    // ── プロキシセクション ──
    containerEl.createEl('h3', { text: s.generalProxyHeading });
    renderProxySection(containerEl, store, cfg.network.proxy);

    // ── OpenVPN セクション ──
    containerEl.createEl('h3', { text: s.networkOpenVpnHeading });
    renderOpenVpnSection(containerEl, store, cfg.network.openvpn);

    // ── 状態・コントロール ──
    renderOpenVpnStatus(containerEl, store, controller, draw);
  };

  draw();
}

function renderProxySection(
  containerEl: HTMLElement,
  store: ConfigStore,
  proxy: { enabled: boolean; url: string; noProxyHosts: string },
): void {
  const s = getLocaleStrings(getUILanguage());
  new Setting(containerEl)
    .setName(s.generalProxyEnabled)
    .setDesc(s.generalProxyEnabledDesc)
    .addToggle((t) =>
      t.setValue(proxy.enabled).onChange(async (v) => {
        const latest = store.load();
        store.save({
          ...latest,
          network: {
            ...latest.network,
            proxy: { ...latest.network.proxy, enabled: v },
          },
        });
        new Notice(s.noticeSaved);
      }),
    );
  new Setting(containerEl)
    .setName(s.generalProxyUrl)
    .setDesc(s.generalProxyUrlDesc)
    .addText((t) =>
      t
        .setPlaceholder('http://proxy.example.com:8080')
        .setValue(proxy.url)
        .onChange(async (v) => {
          const latest = store.load();
          store.save({
            ...latest,
            network: {
              ...latest.network,
              proxy: { ...latest.network.proxy, url: v },
            },
          });
        }),
    );
  new Setting(containerEl)
    .setName(s.generalProxyNoProxy)
    .setDesc(s.generalProxyNoProxyDesc)
    .addText((t) =>
      t
        .setPlaceholder('localhost,127.0.0.1,.local')
        .setValue(proxy.noProxyHosts)
        .onChange(async (v) => {
          const latest = store.load();
          store.save({
            ...latest,
            network: {
              ...latest.network,
              proxy: { ...latest.network.proxy, noProxyHosts: v },
            },
          });
        }),
    );
}

function renderOpenVpnSection(
  containerEl: HTMLElement,
  store: ConfigStore,
  openvpn: OpenVpnSettings,
): void {
  const s = getLocaleStrings(getUILanguage());

  // v0.43.8: インストール状況の警告表示枠（enabled ON かつ未検出のときのみ内容を出す）
  const installWarnEl = containerEl.createDiv('cb-openvpn-install-warning');
  const updateInstallWarning = (enabled: boolean, configuredPath: string): void => {
    installWarnEl.empty();
    if (!enabled) return;
    if (isOpenVpnInstalled(configuredPath)) return;
    installWarnEl.createEl('p', { text: s.networkOpenVpnNotInstalled, cls: 'setting-item-description' });
    installWarnEl.createEl('a', { text: s.networkOpenVpnDownloadLink, href: OPENVPN_DOWNLOAD_URL });
  };
  updateInstallWarning(openvpn.enabled, openvpn.openvpnBinaryPath);

  new Setting(containerEl)
    .setName(s.networkOpenVpnEnabled)
    .setDesc(s.networkOpenVpnEnabledDesc)
    .addToggle((t) =>
      t.setValue(openvpn.enabled).onChange(async (v) => {
        const latest = store.load();
        const configuredPath = latest.network.openvpn.openvpnBinaryPath;
        store.save({
          ...latest,
          network: {
            ...latest.network,
            openvpn: { ...latest.network.openvpn, enabled: v },
          },
        });
        // v0.43.8: チャット画面の VPN トグルを即時再評価（OFF → 非表示 / ON → 表示）
        refreshVpnToggles();
        // v0.43.8: 有効化時に OpenVPN のインストール状況を確認し、未導入ならリンクを提示
        const installed = isOpenVpnInstalled(configuredPath);
        if (v && !installed) {
          new Notice(s.networkOpenVpnNotInstalledNotice);
        } else {
          new Notice(s.noticeSaved);
        }
        updateInstallWarning(v, configuredPath);
      }),
    );
  new Setting(containerEl)
    .setName(s.networkOpenVpnConfigPath)
    .setDesc(s.networkOpenVpnConfigPathDesc)
    .addText((t) =>
      t.setValue(openvpn.configPath).onChange(async (v) => {
        const latest = store.load();
        store.save({
          ...latest,
          network: {
            ...latest.network,
            openvpn: { ...latest.network.openvpn, configPath: v },
          },
        });
      }),
    );
  new Setting(containerEl)
    .setName(s.networkOpenVpnUsername)
    .addText((t) =>
      t.setValue(openvpn.username).onChange(async (v) => {
        const latest = store.load();
        store.save({
          ...latest,
          network: {
            ...latest.network,
            openvpn: { ...latest.network.openvpn, username: v },
          },
        });
      }),
    );
  new Setting(containerEl)
    .setName(s.networkOpenVpnPassword)
    .addText((t) => {
      t.inputEl.type = 'password';
      t.setValue(openvpn.password).onChange(async (v) => {
        const latest = store.load();
        store.save({
          ...latest,
          network: {
            ...latest.network,
            openvpn: { ...latest.network.openvpn, password: v },
          },
        });
      });
    });
  new Setting(containerEl)
    .setName(s.networkOpenVpnBinaryPath)
    .setDesc(s.networkOpenVpnBinaryPathDesc)
    .addText((t) =>
      t.setValue(openvpn.openvpnBinaryPath).onChange(async (v) => {
        const latest = store.load();
        store.save({
          ...latest,
          network: {
            ...latest.network,
            openvpn: { ...latest.network.openvpn, openvpnBinaryPath: v },
          },
        });
      }),
    );
  // v0.43.2 (F-044): Server Override — ドメイン名で .ovpn の remote を上書き
  new Setting(containerEl)
    .setName(s.networkOpenVpnServerOverride)
    .setDesc(s.networkOpenVpnServerOverrideDesc)
    .addText((t) =>
      t.setPlaceholder('myqnap.myqnapcloud.com').setValue(openvpn.serverOverride).onChange(async (v) => {
        const latest = store.load();
        store.save({
          ...latest,
          network: {
            ...latest.network,
            openvpn: { ...latest.network.openvpn, serverOverride: v },
          },
        });
      }),
    );
  new Setting(containerEl)
    .setName(s.networkOpenVpnAutoConnect)
    .addToggle((t) =>
      t.setValue(openvpn.autoConnectOnLlm).onChange(async (v) => {
        const latest = store.load();
        store.save({
          ...latest,
          network: {
            ...latest.network,
            openvpn: { ...latest.network.openvpn, autoConnectOnLlm: v },
          },
        });
        new Notice(s.noticeSaved);
      }),
    );
}

function renderOpenVpnStatus(
  containerEl: HTMLElement,
  store: ConfigStore,
  controller: ReturnType<typeof getOpenVpnController>,
  draw: () => void,
): void {
  const s = getLocaleStrings(getUILanguage());
  const statusEl = containerEl.createDiv('cb-vpn-status');
  // v0.44.1: 接続済みでも経路が入っていない場合の警告表示枠
  const warnEl = containerEl.createDiv('cb-vpn-warning');
  const logEl = containerEl.createEl('pre', { cls: 'cb-vpn-log', text: '' });

  // F-046: 残骸経路削除ボタン（updateUI から先に参照されるためボタン本体はここで作っておく）
  const removeBtn = containerEl.createEl('button', {
    text: s.networkOpenVpnRemoveStale,
    cls: 'cb-vpn-remove-stale',
  });
  removeBtn.style.display = 'none';

  const labelOf = (st: OpenVpnStatus): string =>
    st === 'connected'
      ? s.networkOpenVpnStatusConnected
      : st === 'connecting'
        ? s.networkOpenVpnStatusConnecting
        : st === 'error'
          ? s.networkOpenVpnStatusError
          : s.networkOpenVpnStatusDisconnected;

  const updateUI = (status: OpenVpnStatus, log: string): void => {
    statusEl.setText(`${s.networkOpenVpnStatus}: ${labelOf(status)}`);
    const warning = controller.getWarning();
    warnEl.setText(warning ? `⚠️ ${warning}` : '');
    warnEl.style.display = warning ? '' : 'none';
    // F-046: 警告に「残骸」が含まれる場合のみ削除ボタンを表示
    removeBtn.style.display = warning && warning.includes('残骸') ? '' : 'none';
    logEl.textContent = log.slice(-2000);
  };

  updateUI(controller.getStatus(), controller.getRecentLog());
  controller.subscribe(updateUI);

  /** v0.43.9: 共有・解析しやすいよう、状態と設定の要約 + ログをまとめて出力する */
  const buildLogText = (): string => {
    const ov = store.load().network.openvpn;
    const header: string[] = [
      '=== ClaudianBridge OpenVPN log ===',
      `${s.networkOpenVpnStatus}: ${labelOf(controller.getStatus())}`,
      `${s.networkOpenVpnConfigPath}: ${ov.configPath || '(empty)'}`,
      `${s.networkOpenVpnBinaryPath}: ${ov.openvpnBinaryPath || '(default)'}`,
    ];
    if (ov.serverOverride) header.push(`${s.networkOpenVpnServerOverride}: ${ov.serverOverride}`);
    const log = controller.getRecentLog();
    return `${header.join('\n')}\n\n${log || '(no log)'}`;
  };

  const connectBtn = containerEl.createEl('button', { text: s.networkOpenVpnConnect });
  connectBtn.addEventListener('click', async () => {
    const cfg = store.load();
    try {
      await controller.start(cfg.network.openvpn);
    } catch (e) {
      new Notice(`OpenVPN エラー: ${(e as Error).message}`);
      draw();
    }
  });
  const disconnectBtn = containerEl.createEl('button', {
    text: s.networkOpenVpnDisconnect,
  });
  disconnectBtn.addEventListener('click', async () => {
    await controller.stop();
  });

  // v0.43.9: 接続状態のログデータをコピー（不具合報告・解析用）
  const copyBtn = containerEl.createEl('button', { text: s.networkOpenVpnCopyLog });
  copyBtn.addEventListener('click', async () => {
    try {
      await copyToClipboard(buildLogText());
      new Notice(s.networkOpenVpnCopied);
    } catch (e) {
      new Notice(s.networkOpenVpnCopyFailed.replace('{msg}', (e as Error).message));
    }
  });

  // F-046: 残骸経路削除ボタンのハンドラ（ボタン本体は updateUI より上に作成済み）
  removeBtn.addEventListener('click', async () => {
    removeBtn.style.display = 'none'; // 多重押下防止
    new Notice(s.networkOpenVpnRemoving);
    try {
      const result = await controller.removeStaleRoutes();
      if (!result.ok) {
        const msg = result.reason === 'need-admin'
          ? s.networkOpenVpnNeedAdmin
          : s.networkOpenVpnRemoveFailed;
        new Notice(`${msg}\n${result.detail}`);
        removeBtn.style.display = ''; // 再押下可能に
      } else {
        new Notice(s.networkOpenVpnRemoved.replace('{count}', String(result.removed)));
        if (result.failed.length > 0) {
          new Notice(`失敗: ${result.failed.join(', ')}`);
        }
      }
    } catch (e) {
      new Notice(s.networkOpenVpnRemoveFailed.replace('{msg}', (e as Error).message));
      removeBtn.style.display = '';
    }
  });

  containerEl.append(connectBtn, disconnectBtn, copyBtn, removeBtn);
}

/**
 * v0.43.9: クリップボードへコピーする。
 * Obsidian（Electron）では navigator.clipboard が使えるが、利用不可の環境に備えて
 * textarea + execCommand のフォールバックを持つ。
 */
async function copyToClipboard(text: string): Promise<void> {
  const nav = navigator as Navigator & {
    clipboard?: { writeText?: (t: string) => Promise<void> };
  };
  if (nav.clipboard?.writeText) {
    await nav.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand?.('copy');
  ta.remove();
  if (!ok) throw new Error('clipboard API unavailable');
}
