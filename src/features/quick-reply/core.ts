import type { App } from 'obsidian';
import { Notice } from 'obsidian';

// realclaudian プラグイン（plugin オブジェクト）
interface RealClaudianPlugin {
  activateView?: () => Promise<unknown>;
  getView?: () => RealClaudianView | null;
}

// realclaudian ビュー（getView() の戻り値）
interface RealClaudianView {
  appendToActiveInput?: (text: string) => boolean;
  getActiveTab?: () => RealClaudianTab | null;
}

// realclaudian アクティブタブ（getActiveTab() の戻り値）
// dom.inputEl / dom.messagesEl は推奨検出（recommend-detector.ts）でも共用する
export interface RealClaudianTab {
  dom: { inputEl: HTMLTextAreaElement; messagesEl: HTMLElement };
  controllers?: { inputController?: { sendMessage?: () => Promise<unknown> } };
}

/**
 * v0.23.0: Claudian チャットへ定型文を直接送信する。
 * 優先: inputController.sendMessage()（入力内容を送信）
 * フォールバック: appendToActiveInput()（挿入のみ）
 */
export async function sendToClaudian(
  app: App,
  text: string,
  noticeFn: (m: string) => void = (m) => new Notice(m)
): Promise<boolean> {
  const p = (app as unknown as { plugins?: { plugins?: Record<string, RealClaudianPlugin | undefined> } })
    ?.plugins?.plugins?.['realclaudian'];
  if (!p) {
    noticeFn('⚠️ Claudian プラグインが見つかりません');
    return false;
  }
  try {
    if (typeof p.activateView === 'function') await p.activateView();
    const view = p.getView?.() ?? null;
    const tab = view?.getActiveTab?.() ?? null;
    const inputController = tab?.controllers?.inputController;

    // 直接送信 API が使える場合（優先）
    if (tab?.dom?.inputEl && typeof inputController?.sendMessage === 'function') {
      tab.dom.inputEl.value = text;
      tab.dom.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      await inputController.sendMessage();
      return true;
    }

    // フォールバック: 挿入のみ（従来挙動）
    const ok = !!(view && typeof view.appendToActiveInput === 'function' && view.appendToActiveInput(text));
    if (!ok) noticeFn('⚠️ Claudian チャットが準備できていません');
    return ok;
  } catch (e) {
    noticeFn(`⚠️ Claudian への送信に失敗しました: ${(e as Error).message}`);
    return false;
  }
}
