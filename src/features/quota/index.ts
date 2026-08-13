import type { App, EventRef } from 'obsidian';
import { Platform } from 'obsidian';
import { MultiQuotaService } from './service';
import { QuotaBarView } from './view';
import { readLlmInfoFromSettings } from './llm-info';
import type { ConfigStore } from '../../core/config-store';

export interface ClaudeQuotaHandle {
  service: MultiQuotaService;
  view: QuotaBarView;
  dispose(): Promise<void>;
}

interface RealClaudianViewShape {
  // v0.3.0 で利用
  getInputWrapper?: () => HTMLElement | null;
  // v0.4.0 で追加（直接プロパティ参照）
  newTabButtonEl?: HTMLElement | null;
  containerEl?: HTMLElement | null;
}

interface RealClaudianPluginShape {
  getView?: () => RealClaudianViewShape | null;
}

interface AppWithPlugins {
  plugins?: { plugins?: Record<string, RealClaudianPluginShape | undefined> };
  workspace?: {
    on?: (name: string, cb: (...args: unknown[]) => void) => EventRef | null;
    offref?: (ref: EventRef) => void;
  };
}

let _handle: ClaudeQuotaHandle | null = null;

export function getClaudeQuotaHandle(): ClaudeQuotaHandle | null {
  return _handle;
}

/**
 * realclaudian の NewTab ボタン要素を取得（複数経路の防御的アクセサ）。
 *
 * 1) 直接プロパティ `newTabButtonEl`
 * 2) `containerEl` 内のセレクタ `.claudian-new-tab-btn` または `[aria-label="New tab"]`
 * 3) 旧 API の input-wrapper にフォールバック
 */
function getAnchor(view: unknown): HTMLElement | null {
  if (!view) return null;
  const v = view as RealClaudianViewShape;
  // 1) 直接プロパティ
  if (v.newTabButtonEl instanceof HTMLElement) return v.newTabButtonEl;
  // 2) containerEl 内のセレクタ
  if (v.containerEl instanceof HTMLElement) {
    const found = v.containerEl.querySelector<HTMLElement>(
      '.claudian-new-tab-btn, [aria-label="New tab"]',
    );
    if (found) return found;
  }
  // 3) 旧 API フォールバック
  const wrapper = v.getInputWrapper?.();
  if (wrapper) return wrapper;
  return null;
}

/**
 * Mount the multi-provider quota indicator and start the service.
 *
 * Returns `null` on Mobile (desktop-only feature).
 * Returns a `ClaudeQuotaHandle` on desktop — `dispose()` cleans up everything.
 *
 * Mounts the view at `.claudian-new-tab-btn` (the NewTab button) left neighbor.
 * If the plugin is absent or the API throws, mount is retried on `layout-change`
 * (e.g. when realclaudian is opened later).
 *
 * **Idempotent**: calling registerClaudeQuota() a second time while a handle
 * is still active returns the existing handle instead of creating a new
 * service/view.
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
  // store.getEnv が提供されていればそれを使用（テスト時の環境変数隔離用）。
  // 実機では ConfigStore が process.env を読む。
  const getEnv = (store as unknown as { getEnv?: (k: string) => string | undefined }).getEnv
    ?? ((k: string) => process.env[k]);
  const view = new QuotaBarView();
  // 現在使用中モデルを settings.json から読み取り、インジケータに設定
  // （データ収集周期ごとに再読込し、モデル切替を表示へ反映）
  const refreshModel = (): void => {
    try {
      const llm = readLlmInfoFromSettings(store.load().quota?.claudeSettingsPath);
      view.setModel(llm.model);
    } catch { /* best-effort */ }
  };
  refreshModel();

  const service = new MultiQuotaService({
    app,
    store,
    refreshSec: cfg.general.quotaRefreshSec,
    switchSec: cfg.general.quotaSwitchSec ?? 30,
    getEnv,
    onCollect: refreshModel,
  });
  let layoutRef: EventRef | null = null;

  const tryMount = (): boolean => {
    if (view.isMounted() && view.isConnected()) return true;
    if (view.isMounted() && !view.isConnected()) view.unmount();
    const realClaudian = (app as unknown as AppWithPlugins)?.plugins?.plugins?.['realclaudian'];
    if (!realClaudian?.getView) return false;
    try {
      const v = realClaudian.getView();
      const anchor = getAnchor(v);
      if (!anchor) return false;
      view.mount(anchor);
      view.render(service.getActive());
      return true;
    } catch {
      return false;
    }
  };

  // 初回マウント試行。失敗時は layout-change で再試行
  if (!tryMount()) {
    const ws = (app as unknown as AppWithPlugins)?.workspace;
    if (ws?.on) {
      layoutRef = ws.on('layout-change', () => {
        tryMount();
      });
    }
  }

  service.onUpdate((q) => view.render(q));
  await service.start();

  const handle: ClaudeQuotaHandle = {
    service,
    view,
    async dispose() {
      const ws = (app as unknown as AppWithPlugins)?.workspace;
      if (layoutRef && ws?.offref) ws.offref(layoutRef);
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