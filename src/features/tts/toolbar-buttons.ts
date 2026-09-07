/**
 * v0.12.0: Claudian チャット入力ツールバーへの操作ボタン注入。
 * 旧 claude-tts-settings の claudianMuteButton / claudianFullTextButton の後継。
 *
 * ボタン:
 * - ミュート（3状態）: 🔊 ミュート / 🔊 停止（点滅）/ 🔇 ミュート解除
 * - 全文読み上げ: 📖 全文 / 📄 ヘッダー（v0.12.0 で autoRead.scope と統一同期）
 *
 * 状態同期は store.onSave（設定変更）と onPlaybackChange（再生開始/終了）による
 * イベント駆動。旧プラグインの 3 秒ポーリングは不要。
 */
import { Notice } from 'obsidian';
import type { ConfigStore } from '../../core/config-store';
import { getLocaleStrings, getUILanguage } from '../../core/i18n';
import { isTtsPlaying, stopAllPlayback, onPlaybackChange } from './playback-registry';
import { abortCurrentLlm } from './llm-session';
import { getPlaybackController } from './playback-controller';
import { mdReadState } from './md-read-highlight/state';
import { withFullTextState, isFullTextState } from '../../core/settings';

const TOOLBAR_SELECTOR = '.claudian-input-toolbar';
const MUTE_MARK = 'data-cb-mute';
const FULLTEXT_MARK = 'data-cb-fulltext';

export type MuteState = 'enabled-idle' | 'enabled-playing' | 'disabled';

export function computeMuteState(enabled: boolean, playing: boolean): MuteState {
  if (!enabled) return 'disabled';
  return playing ? 'enabled-playing' : 'enabled-idle';
}

/** アイコンのみ表示（サイズ最小化）。説明は tooltip(title) に載せる */
const MUTE_ICONS: Record<MuteState, string> = {
  'enabled-idle': '🔊',
  'enabled-playing': '⏹',
  'disabled': '🔇',
};

function renderMute(btn: HTMLButtonElement, state: MuteState, engine: string): void {
  const s = getLocaleStrings(getUILanguage());
  btn.classList.remove('is-muted', 'is-playing', 'is-edge-engine');
  const title = state === 'disabled'
    ? s.ttsMuteBtnMuted
    : state === 'enabled-playing' ? s.ttsMuteBtnPlaying : s.ttsMuteBtnIdle;
  btn.textContent = MUTE_ICONS[state];
  btn.title = title;
  if (state === 'disabled') {
    btn.classList.add('is-muted');
  } else if (state === 'enabled-playing') {
    btn.classList.add('is-playing');
  }
  // v0.18.1: Edge-TTS 選択時に追加マーク（ユーザー改良要望：サーバー停止中を視覚化）
  if (engine === 'edge' || engine === 'edge-local') {
    btn.classList.add('is-edge-engine');
  }
}

function renderFullText(btn: HTMLButtonElement, on: boolean): void {
  const s = getLocaleStrings(getUILanguage());
  btn.textContent = on ? '📖' : '📄';
  btn.title = on ? s.ttsFullTextBtnOn : s.ttsFullTextBtnOff;
  if (on) btn.classList.add('is-fulltext');
  else btn.classList.remove('is-fulltext');
}

function makeFullTextButton(store: ConfigStore, _refreshAll: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.classList.add('claude-tts-fulltext-btn', 'claudian-action-btn');
  btn.setAttribute(FULLTEXT_MARK, 'true');
  let busy = false;

  btn.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const cfg = store.load();
      const next = !isFullTextState(cfg);
      store.save(withFullTextState(cfg, next));
      renderFullText(btn, next);
      new Notice(next ? '📖 全文読み上げ ON（全文を読み上げます）' : '📄 ヘッダーのみ読み上げ');
    } catch (e) {
      renderFullText(btn, isFullTextState(store.load()));
      new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
    } finally {
      busy = false;
      btn.disabled = false;
    }
  });

  return btn;
}

function makeMuteButton(store: ConfigStore, refreshAll: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.classList.add('claude-tts-mute-btn', 'claudian-action-btn');
  btn.setAttribute(MUTE_MARK, 'true');
  let busy = false;

  btn.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const cfg = store.load();
      // v0.37.2 (F-033 fix): ミュート系操作は進行中の LLM 原稿生成セッションも即中断する。
      // 音声再生前（「📝 原稿生成中…」状態）では active セットが空のため
      // stopAllPlayback() だけだと LLM 子プロセスが止まらず、Notice が消えない。
      // セッション未開始時は abortCurrentLlm() が no-op（ctrl?.abort()）。
      const stopped = stopAllPlayback();
      const playing = isTtsPlaying() || stopped > 0;
      if (cfg.tts.enabled && playing) {
        abortCurrentLlm();
        getPlaybackController().stop();
        mdReadState.clear(); // v0.37.2: overlay 状態も完全リセット
        // 再生中 → 停止のみ（enabled は変更しない）
        new Notice(stopped > 0 ? `🔇 再生停止 (${stopped})` : '🔇 再生停止');
      } else {
        const next = !cfg.tts.enabled;
        store.save({ ...cfg, tts: { ...cfg.tts, enabled: next } });
        if (!next) {
          stopAllPlayback();
          abortCurrentLlm();
          getPlaybackController().stop();
          mdReadState.clear(); // v0.37.2: ミュート時は overlay もクリア
        }
        new Notice(next ? '🔊 ミュート解除' : '🔇 ミュート');
      }
    } catch (e) {
      refreshAll();
      new Notice(`⚠️ 保存失敗: ${(e as Error).message}`);
    } finally {
      busy = false;
      btn.disabled = false;
      refreshAll();
    }
  });

  return btn;
}

export function setupToolbarButtons(store: ConfigStore): () => void {
  const refreshAll = (): void => {
    const cfg = store.load();
    const playing = isTtsPlaying();
    const engine = cfg.tts.engine;
    const muteBtns = document.querySelectorAll(`[${MUTE_MARK}]`);
    const fullBtns = document.querySelectorAll(`[${FULLTEXT_MARK}]`);
    console.log('[cb-tts] refreshAll playing=', playing, 'muteBtns=', muteBtns.length, 'fullBtns=', fullBtns.length);
    muteBtns.forEach((el) => {
      const b = el as HTMLButtonElement;
      if (b.disabled) return;
      renderMute(b, computeMuteState(cfg.tts.enabled, playing), engine);
    });
    fullBtns.forEach((el) => {
      const b = el as HTMLButtonElement;
      if (b.disabled) return;
      renderFullText(b, isFullTextState(cfg));
    });
  };

  // アプリ内の設定変更を即時反映（設定タブ・CLI 同期等の全 save を捕捉）
  store.onSave(refreshAll);
  // 再生開始/終了を即時反映（点滅⇄固定切替）
  const offPlayback = onPlaybackChange(refreshAll);

  const inject = (toolbar: Element): void => {
    if (!toolbar.querySelector(`[${MUTE_MARK}]`)) {
      const btn = makeMuteButton(store, refreshAll);
      const cfg = store.load();
      renderMute(btn, computeMuteState(cfg.tts.enabled, isTtsPlaying()), cfg.tts.engine);
      toolbar.appendChild(btn);
    }
    if (!toolbar.querySelector(`[${FULLTEXT_MARK}]`)) {
      const btn = makeFullTextButton(store, refreshAll);
      renderFullText(btn, isFullTextState(store.load()));
      toolbar.appendChild(btn);
    }
  };

  const scan = (): void => {
    document.querySelectorAll(TOOLBAR_SELECTOR).forEach(inject);
  };
  scan();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      // Array.from 必須: NodeList は for...of だと TS2488 になる（tsconfig lib 構成）
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

  return () => {
    offPlayback();
    observer.disconnect();
    document.querySelectorAll(`[${MUTE_MARK}], [${FULLTEXT_MARK}]`).forEach((el) => el.remove());
  };
}
