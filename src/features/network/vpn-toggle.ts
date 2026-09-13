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

  // === DOM 構築 ===
  const wrapper = document.createElement('div');
  wrapper.className = 'cb-vpn-toggle';

  const button = document.createElement('button');
  button.className = 'cb-vpn-toggle__button';
  button.setAttribute('data-status', 'disconnected');

  const icon = document.createElement('span');
  icon.className = 'cb-vpn-toggle__icon';
  icon.textContent = '🔌';

  const label = document.createElement('span');
  label.className = 'cb-vpn-toggle__label';
  label.textContent = s.vpnToggleLabel;

  button.append(icon, label);

  const badge = document.createElement('span');
  badge.className = 'cb-vpn-badge cb-vpn-badge--disconnected';
  badge.title = s.vpnToggleTitleDisconnected;
  badge.textContent = '🔴';

  wrapper.append(button, badge);
  parent.insertBefore(wrapper, insertBefore);

  // === 状態反映 ===
  let configured = true;
  const applyStatus = (status: OpenVpnStatus): void => {
    button.setAttribute('data-status', status);
    badge.className = `cb-vpn-badge cb-vpn-badge--${status}`;
    badge.textContent = status === 'connected' ? '🟢' : status === 'connecting' ? '🟡' : '🔴';
    label.textContent = status === 'connecting' ? s.vpnToggleConnecting
      : status === 'connected' ? s.vpnToggleConnected
      : status === 'error' ? s.vpnToggleError
      : s.vpnToggleLabel;
    button.disabled = status === 'connecting' || !configured;
    button.title = !configured ? s.vpnToggleTitleNotConfigured
      : status === 'connected' ? s.vpnToggleTitleConnected
      : s.vpnToggleTitleDisconnected;
  };

  const checkEnabledAndUpdate = (): boolean => {
    const cfg = store.load() as { network?: { openvpn?: { enabled?: boolean; configPath?: string } } };
    const enabled = cfg?.network?.openvpn?.enabled === true && cfg.network.openvpn.configPath !== '';
    configured = enabled;
    button.disabled = !enabled || button.getAttribute('data-status') === 'connecting';
    if (!enabled) button.title = s.vpnToggleTitleNotConfigured;
    return enabled;
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
  checkEnabledAndUpdate();
  applyStatus(controller.getStatus());

  const unsubscribe = controller.subscribe((status) => applyStatus(status));

  return {
    destroy: () => {
      unsubscribe();
      button.removeEventListener('click', onClick);
      wrapper.remove();
    },
  };
}
