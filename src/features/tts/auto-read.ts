import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { extractReportText } from './extract-report';
import { resolveSpeechFilter } from './speak';
import { createLatestWinsSpeaker } from './speak-coordinator';
import type { SpeakFn } from './speak-coordinator';
import { stopAllPlayback } from './playback-registry';

/**
 * v0.11.0: タスク終了時の自動読み上げ。
 * realclaudian view のストリーミング完了（true→false）を検出し、
 * 📢 報告ブロックを抽出して TTS に渡す。
 *
 * realclaudian 内部構造（main.js 実測、プロパティ名は minify 後も維持）:
 * - app.plugins.plugins['realclaudian'].getAllViews() / getView()
 * - view.getTabManager().callbacks.onTabStreamingChanged(tabId, isStreaming)  ← hook ポイント
 *   ※ view 自体には callbacks も onStreamingChanged も存在しない（v0.11.0 不発火の根因）。
 *   tabManager は view.onOpen() のたびに再生成されるため、scan を都度実行して
 *   未 hook の tabManager.callbacks を検出する。
 * ⚠️ realclaudian アップグレード後は上記を grep 复核すること。
 */

interface RealClaudianTabManagerCallbacks {
  onTabStreamingChanged?: (tabId: string, streaming: boolean) => void;
}

interface RealClaudianView {
  containerEl?: Element;
  /** v0.11.0 以前の想定（実在せず・後方互換のフォールバックとして残す） */
  callbacks?: RealClaudianTabManagerCallbacks;
  onStreamingChanged?: (conversationId: string, streaming: boolean) => void;
  /** 実測: callbacks を保持するのは tabManager */
  getTabManager?: () => { callbacks?: RealClaudianTabManagerCallbacks } | null;
}

interface RealClaudianPlugin {
  getView?: () => RealClaudianView | null;
  getAllViews?: () => RealClaudianView[];
}

export interface AutoReadDeps {
  app: App;
  store: ConfigStore;
  speak: SpeakFn;
  noticeFn?: (m: string) => void;
}

export function setupAutoReadTTS(deps: AutoReadDeps): () => void {
  const notice = deps.noticeFn ?? ((m: string) => { new Notice(m); });
  const enqueue = createLatestWinsSpeaker(deps.speak, stopAllPlayback);
  const hooked = new WeakSet<RealClaudianTabManagerCallbacks>();
  /** 遷移判定は view 単位ではなく tabId 単位（同一 view 内の複数 tab で独立 strmeming するため） */
  const prevStreaming = new Map<string, boolean>();
  const restores: Array<() => void> = [];
  /** 抽出リトライ用タイマー（cleanup で破棄） */
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  let warned = false;

  const getViews = (): RealClaudianView[] => {
    const p = (deps.app as unknown as { plugins?: { plugins?: Record<string, RealClaudianPlugin | undefined> } })
      ?.plugins?.plugins?.['realclaudian'];
    if (!p) {
      console.debug('[cb-auto-read] realclaudian plugin not found');
      return [];
    }
    try {
      if (typeof p.getAllViews === 'function') {
        const vs = p.getAllViews();
        console.debug('[cb-auto-read] getAllViews ->', vs.length);
        return vs;
      }
      if (typeof p.getView === 'function') {
        const v = p.getView();
        return v ? [v] : [];
      }
    } catch (e) { console.warn('[cb-auto-read] getViews error', e); }
    return [];
  };

  /**
   * 対象 view のアクティブタブのメッセージ領域を取得。
   * 複数タブ時は view.containerEl.querySelector が最初のタブの領域を返してしまうため、
   * アクティブタブ（.claudian-hidden なし）の .claudian-messages を優先する。
   */
  const findMessagesEl = (root: Element | undefined): Element | null => {
    return root?.querySelector('.claudian-tab-content:not(.claudian-hidden) .claudian-messages')
      ?? root?.querySelector('.claudian-messages')
      ?? null;
  };

  const onStreamState = (view: RealClaudianView, tabId: string, streaming: boolean): void => {
    const prev = prevStreaming.get(tabId) ?? false;
    prevStreaming.set(tabId, streaming);
    if (streaming || prev === streaming) return; // true→false 遷移のみ
    try {
      const cfg = deps.store.load();
      if (!cfg.tts.enabled || cfg.tts.autoRead?.enabled === false) return;
      const messages = findMessagesEl(view.containerEl);
      if (!messages) return; // メッセージ領域が見つからないアノマリは静かにスキップ
      // v0.12.1: stream-end 直後は markdown レンダリングが未完了のことがあるため、
      // 抽出を 400ms 間隔で最大5回（計 ~1.6s）リトライする。
      const scope = cfg.tts.autoRead?.scope ?? 'header';
      const tryExtract = (attempt: number): void => {
        const text = extractReportText(messages, scope, {
          excludeCallouts: cfg.tts.excludeCallouts ?? true,
          filter: resolveSpeechFilter(cfg, 'autoRead'),
        });
        if (text) {
          notice(`🔊 自動読み上げ: ${text.length} 文字を読み上げます`);
          enqueue(text);
          return;
        }
        // 📢 報告の無い通常応答は静かにスキップ（リトライはレンダリング遅延対策のみ）
        if (attempt < 4) {
          const timer = setTimeout(() => tryExtract(attempt + 1), 400);
          pendingTimers.add(timer);
        } else {
          console.debug('[cb-auto-read] give up: 読み上げテキストを抽出できませんでした');
        }
      };
      tryExtract(0);
    } catch (e) {
      console.error('[claudian-bridge] auto-read error:', e);
    }
  };

  const warnOnce = (): void => {
    if (warned) return;
    warned = true;
    notice('⚠️ 自動読み上げ: Claudian 側の構造が変更されたため無効です');
    console.warn('[claudian-bridge] auto-read: hook point not found (realclaudian upgraded?)');
  };

  const hookCallbacks = (view: RealClaudianView, cbs: RealClaudianTabManagerCallbacks): void => {
    if (hooked.has(cbs)) return;
    const orig = cbs.onTabStreamingChanged;
    cbs.onTabStreamingChanged = (tabId, streaming) => {
      orig?.call(cbs, tabId, streaming);
      onStreamState(view, tabId, streaming);
    };
    hooked.add(cbs);
    restores.push(() => { cbs.onTabStreamingChanged = orig; });
    console.debug('[cb-auto-read] hook attached (tabManager.callbacks)');
  };

  const hookView = (view: RealClaudianView): void => {
    // 第一候補（実測構造）: view.getTabManager().callbacks をチェーン
    try {
      const tm = typeof view.getTabManager === 'function' ? view.getTabManager() : null;
      if (tm?.callbacks && typeof tm.callbacks === 'object') {
        console.debug('[cb-auto-read] found tabManager.callbacks (getTabManager)');
        hookCallbacks(view, tm.callbacks);
        return;
      }
      console.debug('[cb-auto-read] getTabManager returned null or no callbacks:', !!tm, tm && Object.keys(tm).slice(0,5));
    } catch (e) { console.warn('[cb-auto-read] getTabManager error', e); }
    // 後方互換: view 直下の callbacks（実在しないが旧想定構造）
    if (view.callbacks && typeof view.callbacks === 'object') {
      hookCallbacks(view, view.callbacks);
      return;
    }
    // フォールバック: view.onStreamingChanged メソッドをラップ（tabId が無いので view 単位）
    if (typeof view.onStreamingChanged === 'function') {
      const orig = view.onStreamingChanged.bind(view);
      view.onStreamingChanged = (conversationId, streaming) => {
        orig(conversationId, streaming);
        onStreamState(view, conversationId, streaming);
      };
      hooked.add(view as unknown as RealClaudianTabManagerCallbacks);
      restores.push(() => { view.onStreamingChanged = orig; });
      return;
    }
    warnOnce();
  };

  const scan = (): void => {
    for (const v of getViews()) hookView(v);
  };
  scan();

  const layoutRef = deps.app.workspace.on('layout-change', scan);

  return () => {
    deps.app.workspace.offref(layoutRef);
    for (const r of restores) {
      try { r(); } catch { /* view 破棄済み等は無視 */ }
    }
    for (const t of pendingTimers) clearTimeout(t);
    pendingTimers.clear();
  };
}
