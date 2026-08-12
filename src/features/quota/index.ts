import type { App } from 'obsidian';
import { Platform } from 'obsidian';
import { ClaudeQuotaService } from './core';
import { QuotaBarView } from './view';
import type { ConfigStore } from '../../core/config-store';

export interface ClaudeQuotaHandle {
  service: ClaudeQuotaService;
  view: QuotaBarView;
  dispose(): Promise<void>;
}

interface RealClaudianPluginShape {
  getView?: () => { getInputWrapper?: () => HTMLElement | null } | null;
}

interface AppWithPlugins {
  plugins?: { plugins?: Record<string, RealClaudianPluginShape | undefined> };
}

let _handle: ClaudeQuotaHandle | null = null;

export function getClaudeQuotaHandle(): ClaudeQuotaHandle | null {
  return _handle;
}

/**
 * Mount the Claude quota bar and start the service.
 *
 * Returns `null` on Mobile (desktop-only feature).
 * Returns a `ClaudeQuotaHandle` on desktop — `dispose()` cleans up everything.
 *
 * Mounts the view by calling `realclaudian.getView().getInputWrapper()`.
 * If the plugin is absent or the API throws, mount is silently skipped
 * (the service still runs so callers can read the snapshot via the events).
 *
 * Service is only `start()`ed when `quotaEnabled` is true; otherwise the
 * service stays in 'idle' state and no polling happens.
 *
 * **Idempotent**: calling registerClaudeQuota() a second time while a handle
 * is still active returns the existing handle instead of creating a new
 * service/view. This prevents double-mount when both main.ts (onload) and
 * SettingTabGeneral (toggle ON) call it.
 */
export async function registerClaudeQuota(
  app: App,
  store: ConfigStore,
): Promise<ClaudeQuotaHandle | null> {
  // Mobile はデスクトップ専用機能
  if (Platform.isMobile) return null;

  // 冪等性: 既存 handle があればそのまま返す（二重 register 防止）
  if (_handle) return _handle;

  const cfg = store.load();
  const service = new ClaudeQuotaService({
    app,
    store,
    refreshSec: cfg.general.quotaRefreshSec,
  });

  const view = new QuotaBarView();

  // realclaudian が有効ならラッパ要素を取得して view をマウント
  // 失敗しても silent にスキップ（service は動かし続ける）
  const realClaudian = (app as unknown as AppWithPlugins)?.plugins?.plugins?.['realclaudian'];
  let mountedWrapper: HTMLElement | null = null;
  if (realClaudian?.getView) {
    try {
      const v = realClaudian.getView();
      const wrapper = v?.getInputWrapper?.();
      if (wrapper) {
        view.mount(wrapper);
        mountedWrapper = wrapper;
      }
    } catch {
      // マウント失敗は silent skip
    }
  }

  // refresh ボタンの click をイベント委譲でバインド。
  // render() が 60s tick で replaceChildren() してボタンを破棄するため、
  // 直接バインドは最初の render 後の tick で切れる。container は mount 期間中
  // 生き残るため、委譲が安全（Task 7-8 review の申し送り）。
  if (mountedWrapper) {
    bindRefreshDelegation(mountedWrapper, service, view);
  }

  // Service 更新を View に反映
  service.onUpdate((snap) => view.render(snap));

  // quotaEnabled が true のときだけ Service 起動
  if (cfg.general.quotaEnabled) {
    await service.start();
  }

  const handle: ClaudeQuotaHandle = {
    service,
    view,
    async dispose() {
      await service.stop();
      view.unmount();
      if (_handle === handle) _handle = null;
    },
  };
  _handle = handle;
  return handle;
}

/** unregisterClaudeQuota() — for plugin onunload */
export async function unregisterClaudeQuota(): Promise<void> {
  if (_handle) await _handle.dispose();
}

/**
 * Wrapper 直前に挿入された quota-bar 要素に click イベント委譲を張る。
 *
 * QuotaBarView.render() は 60 秒 tick で `replaceChildren()` するため、
 * ボタンへの直接バインドは最初の render 後の tick で切れる罠がある。
 * quota-bar 要素自体は mount 期間中ずっと生き残るため、委譲が安全。
 */
function bindRefreshDelegation(
  wrapper: HTMLElement,
  service: ClaudeQuotaService,
  view: QuotaBarView,
): void {
  const bar = wrapper.previousElementSibling;
  if (!(bar instanceof HTMLElement) || !bar.classList.contains('claudian-quota-bar')) return;
  bar.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.classList.contains('claudian-quota-bar__refresh')) {
      void service.forceRefresh().then((snap) => view.render(snap));
    }
  });
}
