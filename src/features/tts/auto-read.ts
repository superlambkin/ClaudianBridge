import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { extractReportText } from './extract-report';
import { createLatestWinsSpeaker } from './speak-coordinator';
import type { SpeakFn } from './speak-coordinator';

/**
 * v0.11.0: タスク終了時の自動読み上げ。
 * realclaudian view のストリーミング完了（true→false）を検出し、
 * 📢 報告ブロックを抽出して TTS に渡す。
 *
 * realclaudian 内部構造（main.js 実測、プロパティ名は minify 後も維持）:
 * - app.plugins.plugins['realclaudian'].getAllViews() / getView()
 * - view.callbacks.onTabStreamingChanged(tabId, isStreaming)  ← 第一 hook ポイント
 * - view.onStreamingChanged(conversationId, isStreaming)      ← フォールバック
 * ⚠️ realclaudian アップグレード後は上記を grep 复核すること。
 */

interface RealClaudianView {
  containerEl?: Element;
  callbacks?: { onTabStreamingChanged?: (tabId: string, streaming: boolean) => void };
  onStreamingChanged?: (conversationId: string, streaming: boolean) => void;
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
  const enqueue = createLatestWinsSpeaker(deps.speak);
  const hooked = new WeakSet<object>();
  const prevStreaming = new WeakMap<object, boolean>();
  const restores: Array<() => void> = [];
  let warned = false;

  const getViews = (): RealClaudianView[] => {
    const p = (deps.app as unknown as { plugins?: { plugins?: Record<string, RealClaudianPlugin | undefined> } })
      ?.plugins?.plugins?.['realclaudian'];
    if (!p) return [];
    try {
      if (typeof p.getAllViews === 'function') return p.getAllViews();
      if (typeof p.getView === 'function') {
        const v = p.getView();
        return v ? [v] : [];
      }
    } catch { /* best-effort */ }
    return [];
  };

  const onStreamState = (view: RealClaudianView, streaming: boolean): void => {
    const prev = prevStreaming.get(view) ?? false;
    prevStreaming.set(view, streaming);
    if (streaming || prev === streaming) return; // true→false 遷移のみ
    try {
      const cfg = deps.store.load();
      if (!cfg.tts.enabled || cfg.tts.autoRead?.enabled === false) return;
      const root = view.containerEl;
      const messages = root?.querySelector('.claudian-messages');
      if (!messages) return;
      const text = extractReportText(messages, cfg.tts.autoRead?.scope ?? 'header');
      if (text) enqueue(text);
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

  const hookView = (view: RealClaudianView): void => {
    if (hooked.has(view)) return;
    // 第一候補: callbacks.onTabStreamingChanged をチェーン
    if (view.callbacks && typeof view.callbacks === 'object') {
      const cbs = view.callbacks;
      const orig = cbs.onTabStreamingChanged;
      cbs.onTabStreamingChanged = (tabId, streaming) => {
        orig?.call(cbs, tabId, streaming);
        onStreamState(view, streaming);
      };
      hooked.add(view);
      restores.push(() => { cbs.onTabStreamingChanged = orig; });
      return;
    }
    // フォールバック: onStreamingChanged メソッドをラップ
    if (typeof view.onStreamingChanged === 'function') {
      const orig = view.onStreamingChanged.bind(view);
      view.onStreamingChanged = (conversationId, streaming) => {
        orig(conversationId, streaming);
        onStreamState(view, streaming);
      };
      hooked.add(view);
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
  };
}
