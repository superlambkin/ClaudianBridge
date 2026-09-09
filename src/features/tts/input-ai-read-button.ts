/**
 * v0.16.0: ClaudianChat 入力ツールバー右端への ✨AI読み上げボタン。
 * クリックで: 入力文 → resolveLlmClient().runPrompt(buildPolishPrompt(text)) で指令文整形
 * → 入力欄上書き → speakText('inputAi', ...) で読み上げ。失敗時は元文のまま読み上げる。
 *
 * v0.39.0 (F-039): deps.polish コールバックを廃止し、dispatch 経由で
 * ThinkingConfig を反映した LlmClient を直接取得するように変更。
 *
 * realclaudian 構造（main.js 実測）:
 *   .claudian-input-composer
 *     ├── .claudian-input-wrapper
 *     │     └── textarea          ← tab.dom.inputEl（input イベントで状態同期）
 *     └── .claudian-input-toolbar ← ミュート🔊 / 📖全文 / ✨(本ボタン) が並ぶ
 */
import { Notice } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { DEFAULT_THINKING_CONFIGS } from '../../core/settings';
import { speakText } from './speak';
import { resolveLlmClient } from '../llm/dispatch';
import { readLlmInfoFromSettings, resolveApiKey } from '../quota/llm-info';
import { buildPolishPrompt } from '../llm/claude-cli';

const TOOLBAR_SELECTOR = '.claudian-input-toolbar';
const INPUT_MARK = 'data-cb-input-ai';
const COMPOSER_SELECTOR = '.claudian-input-composer';

export interface InputAiReadDeps {
  store: ConfigStore;
  noticeFn?: (m: string) => void;
}

/** ツールバーが属するチャット入力 textarea を取得 */
export function findClaudianInput(toolbar: Element): HTMLTextAreaElement | null {
  const composer = toolbar.closest(COMPOSER_SELECTOR) ?? document.querySelector(COMPOSER_SELECTOR);
  return (composer?.querySelector('textarea') as HTMLTextAreaElement | null) ?? null;
}

export function setupInputAiReadButton(deps: InputAiReadDeps): () => void {
  const notice = deps.noticeFn ?? ((m: string) => { new Notice(m); });

  const handleClick = async (btn: HTMLButtonElement): Promise<void> => {
    const cfg = deps.store.load();
    const input = findClaudianInput(btn);
    const original = (input?.value ?? '').trim();

    if (!cfg.tts.enabled) { notice('🔇 ミュート中です'); return; }
    if (!original) { notice('入力がありません'); return; }

    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      const llmInfo = readLlmInfoFromSettings(cfg.quota?.claudeSettingsPath);
      // テスト用 cfg で thinking フィールドが省略された場合に既定値でフォールバック
      const providerDefaults = DEFAULT_THINKING_CONFIGS as Record<string, typeof DEFAULT_THINKING_CONFIGS.claude>;
      const thinking = (cfg.thinking as Record<string, typeof DEFAULT_THINKING_CONFIGS.claude> | undefined)?.[llmInfo.provider]
        ?? providerDefaults[llmInfo.provider]
        ?? DEFAULT_THINKING_CONFIGS.claude;
      // v0.40.0 (F-040): プロバイダ別 API キーを解決して渡す
      const apiKey = resolveApiKey(llmInfo.provider, cfg.quota ?? {});
      const client = resolveLlmClient(llmInfo.provider, apiKey, thinking);
      const polished = await client.runPrompt(buildPolishPrompt(original), { thinking });
      const unfenced = typeof polished === 'string'
        ? polished.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/, '$1').trim()
        : null;
      const result = (unfenced && unfenced !== '') ? unfenced : null;
      if (result && input) {
        input.value = result;
        // realclaudian は input イベントで内部状態（送信テキスト等）を同期する
        input.dispatchEvent(new Event('input', { bubbles: true }));
        notice(`元文: ${original}`);
        await speakText('inputAi', result, cfg, { fallbackText: original });
      } else {
        notice('⚠️ 整形に失敗したため元文を読み上げます');
        await speakText('inputAi', original, cfg, { noticeOnEmpty: true });
      }
    } catch (e) {
      console.warn('[cb-input-ai] failed:', e);
      notice('⚠️ 整形に失敗したため元文を読み上げます');
      try { await speakText('inputAi', original, cfg, { noticeOnEmpty: true }); } catch { /* ignore */ }
    } finally {
      btn.disabled = false;
      btn.textContent = '✨';
    }
  };

  const inject = (toolbar: Element): void => {
    if (deps.store.load().tts.inputAi?.enabled === false) return;
    if (toolbar.querySelector(`[${INPUT_MARK}]`)) return;
    const btn = document.createElement('button');
    btn.classList.add('claudian-action-btn', 'cb-input-ai-btn');
    btn.setAttribute(INPUT_MARK, 'true');
    btn.textContent = '✨';
    btn.title = 'AI読み上げ：入力文を整形して読み上げます';
    btn.addEventListener('click', () => { void handleClick(btn); });
    toolbar.appendChild(btn);
  };

  const scan = (): void => {
    document.querySelectorAll(TOOLBAR_SELECTOR).forEach(inject);
  };
  scan();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement && (node.matches(TOOLBAR_SELECTOR) || node.querySelector(TOOLBAR_SELECTOR))) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) scan();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // 設定変更で表示/非表示を即時反映
  // ※ ConfigStore.onSave は購読解除を返さない（toolbar-buttons.ts と同じ運用。
  //   プラグイン終了時に store.close() で解放される）
  deps.store.onSave(() => {
    if (deps.store.load().tts.inputAi?.enabled === false) {
      document.querySelectorAll(`[${INPUT_MARK}]`).forEach((el) => el.remove());
    } else {
      scan();
    }
  });

  return () => {
    observer.disconnect();
    document.querySelectorAll(`[${INPUT_MARK}]`).forEach((el) => el.remove());
  };
}
