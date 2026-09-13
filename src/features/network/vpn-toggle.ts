/**
 * Claudian 画面 OpenVPN 制御トグル。
 * v0.43.1 (F-043): YOLO トグル隣に状態バッジ付きボタンを追加。
 * スタイルはルート styles.css の .cb-vpn-* クラス（F-043 セクション）を参照。
 */
import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { getOpenVpnController } from './openvpn';
import type { OpenVpnStatus } from './types';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';

const CONTAINER_SELECTOR = '.claudian-input-container';
const YOLO_TOGGLE_SELECTOR = '.claudian-permission-toggle';
const PLUGIN_ID = 'ClaudianBridge';

interface VpnToggleHandle {
  destroy: () => void;
}

export function setupVpnToggle(app: App, store: ConfigStore): () => void {
  const handles = new Map<Element, VpnToggleHandle>();

  const injectInto = (container: Element): void => {
    if (handles.has(container)) return;
    const yolo = container.querySelector(YOLO_TOGGLE_SELECTOR);
    if (!yolo || !yolo.parentElement) return;
    handles.set(container, createVpnToggle(app, store, yolo.parentElement, yolo));
  };

  const injectAll = (): void => {
    document.querySelectorAll(CONTAINER_SELECTOR).forEach((el) => injectInto(el));
  };

  const removeAll = (): void => {
    handles.forEach((h) => h.destroy());
    handles.clear();
  };

  const rescan = (): void => {
    handles.forEach((handle, el) => {
      if (!document.contains(el)) {
        handle.destroy();
        handles.delete(el);
      }
    });
    injectAll();
  };

  injectAll();

  const observer = new MutationObserver(() => rescan());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  return () => {
    observer.disconnect();
    removeAll();
  };
}

function createVpnToggle(
  app: App,
  store: ConfigStore,
  parent: HTMLElement,
  insertBefore: Element,
): VpnToggleHandle {
  const controller = getOpenVpnController();
  const s = getLocaleStrings(getUILanguage());

  // === DOM 構築（v0.43.4: YOLO トグルと同デザインのスイッチ型） ===
  const wrapper = document.createElement('div');
  wrapper.className = 'cb-vpn-toggle';

  const label = document.createElement('span');
  label.className = 'cb-vpn-label';
  label.textContent = s.vpnToggleLabel;

  const button = document.createElement('button');
  button.className = 'cb-vpn-switch';
  button.setAttribute('data-status', 'disconnected');
  button.setAttribute('aria-label', s.vpnToggleLabel);
  button.title = s.vpnToggleTitleDisconnected;

  wrapper.append(label, button);
  parent.insertBefore(wrapper, insertBefore);

  // === 状態反映 ===
  let configured = true;
  const applyStatus = (status: OpenVpnStatus): void => {
    button.setAttribute('data-status', status);
    wrapper.setAttribute('data-status', status);
    button.disabled = status === 'connecting' || !configured;
    button.title = !configured ? s.vpnToggleTitleNotConfigured
      : status === 'connected' ? s.vpnToggleTitleConnected
      : s.vpnToggleTitleDisconnected;
    // ラッパーの表示/非表示は enabled 状態に依存（status 更新時に再評価）
    applyVisibility();
    // v0.43.7: 接続中は外部トンネル確立を定期確認（色の取りこぼし防止）
    if (status === 'connecting') startExternalCheck(); else stopExternalCheck();
  };

  // v0.43.7: プラグインが openvpn の成功ログを取りこぼしても、OS ルーティングに
  // トンネルが存在すれば connected（緑）に補正する。connecting 中のみ 2 秒間隔で確認。
  let externalCheckTimer: ReturnType<typeof setInterval> | null = null;
  function stopExternalCheck(): void {
    if (externalCheckTimer !== null) {
      clearInterval(externalCheckTimer);
      externalCheckTimer = null;
    }
  }
  function startExternalCheck(): void {
    if (externalCheckTimer !== null) return;
    externalCheckTimer = setInterval(() => {
      if (controller.getStatus() !== 'connecting') { stopExternalCheck(); return; }
      if (controller.detectExternalConnection() === 'connected') {
        stopExternalCheck();
        applyStatus('connected');
      }
    }, 2000);
  }

  // v0.43.5: enabled=false または configPath 未設定時はトグル自体を非表示
  const applyVisibility = (): void => {
    const cfg = store.load() as { network?: { openvpn?: { enabled?: boolean; configPath?: string } } };
    const enabled = cfg?.network?.openvpn?.enabled === true;
    const hasConfig = (cfg?.network?.openvpn?.configPath ?? '') !== '';
    const visible = enabled && hasConfig;
    wrapper.style.display = visible ? '' : 'none';
    configured = visible;
  };

  const checkEnabledAndUpdate = (): boolean => {
    applyVisibility();
    return configured;
  };

  // === クリックハンドラ ===
  const onClick = async (): Promise<void> => {
    if (!checkEnabledAndUpdate()) {
      new Notice(s.vpnToggleNotConfigured);
      const setting = (app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
      setting?.open?.();
      setting?.openTabById?.(PLUGIN_ID);
      return;
    }
    const status = controller.getStatus();
    const cfg = store.load() as { network?: { openvpn?: Parameters<typeof controller.start>[0] } };
    try {
      if (status === 'connected') {
        await controller.stop();
      } else if (status === 'disconnected' || status === 'error') {
        if (cfg?.network?.openvpn) await controller.start(cfg.network.openvpn);
      }
      // 'connecting' は button.disabled で防護
    } catch (e) {
      new Notice(`⚠️ OpenVPN 操作に失敗: ${(e as Error).message}`);
    }
  };

  button.addEventListener('click', onClick);
  applyVisibility();
  // v0.43.6: 既に外部プロセスで VPN 接続済み（OS ルーティングで検出）なら connecting のままにせず connected に補正
  const initialStatus = ((): OpenVpnStatus => {
    const ctrl = controller.getStatus();
    if (ctrl === 'connecting' && controller.detectExternalConnection() === 'connected') return 'connected';
    return ctrl;
  })();
  applyStatus(initialStatus);

  const unsubscribe = controller.subscribe((status) => applyStatus(status));

  return {
    destroy: () => {
      stopExternalCheck();
      unsubscribe();
      button.removeEventListener('click', onClick);
      wrapper.remove();
    },
  };
}
