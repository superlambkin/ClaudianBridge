/**
 * ネットワークタブ（プロキシ + OpenVPN 接続）。
 * v0.43.0 (F-042): 一般タブから分離して新設。
 */
import { Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../core/config-store';
import { getLocaleStrings, getUILanguage } from '../core/i18n';
import { getOpenVpnController } from '../features/network/openvpn';
import type { OpenVpnSettings, OpenVpnStatus } from '../features/network/types';

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
  new Setting(containerEl)
    .setName(s.networkOpenVpnEnabled)
    .setDesc(s.networkOpenVpnEnabledDesc)
    .addToggle((t) =>
      t.setValue(openvpn.enabled).onChange(async (v) => {
        const latest = store.load();
        store.save({
          ...latest,
          network: {
            ...latest.network,
            openvpn: { ...latest.network.openvpn, enabled: v },
          },
        });
        new Notice(s.noticeSaved);
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
  const logEl = containerEl.createEl('pre', { cls: 'cb-vpn-log', text: '' });

  const updateUI = (status: OpenVpnStatus, log: string): void => {
    const labelOf = (st: OpenVpnStatus): string =>
      st === 'connected'
        ? s.networkOpenVpnStatusConnected
        : st === 'connecting'
          ? s.networkOpenVpnStatusConnecting
          : st === 'error'
            ? s.networkOpenVpnStatusError
            : s.networkOpenVpnStatusDisconnected;
    statusEl.setText(`${s.networkOpenVpnStatus}: ${labelOf(status)}`);
    logEl.textContent = log.slice(-2000);
  };

  updateUI(controller.getStatus(), controller.getRecentLog());
  controller.subscribe(updateUI);

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
  containerEl.append(connectBtn, disconnectBtn);
}
