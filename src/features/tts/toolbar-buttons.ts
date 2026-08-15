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

const TOOLBAR_SELECTOR = '.claudian-input-toolbar';
const MUTE_MARK = 'data-cb-mute';
const FULLTEXT_MARK = 'data-cb-fulltext';

export type MuteState = 'enabled-idle' | 'enabled-playing' | 'disabled';

export function computeMuteState(enabled: boolean, playing: boolean): MuteState {
  if (!enabled) return 'disabled';
  return playing ? 'enabled-playing' : 'enabled-idle';
}

function renderMute(btn: HTMLButtonElement, state: MuteState): void {
  const s = getLocaleStrings(getUILanguage());
  btn.classList.remove('is-muted', 'is-playing');
  if (state === 'disabled') {
    btn.textContent = s.ttsMuteBtnMuted;
    btn.title = s.ttsMuteBtnMuted;
    btn.classList.add('is-muted');
  } else if (state === 'enabled-playing') {
    btn.textContent = s.ttsMuteBtnPlaying;
    btn.title = s.ttsMuteBtnPlaying;
    btn.classList.add('is-playing');
  } else {
    btn.textContent = s.ttsMuteBtnIdle;
    btn.title = s.ttsMuteBtnIdle;
  }
}

function makeMuteButton(store: ConfigStore, refreshAll: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.classList.add('claude-tts-mute-btn', 'claudian-action-btn');
  btn.setAttribute('aria-label', 'Mute');
  btn.setAttribute(MUTE_MARK, 'true');
  let busy = false;

  btn.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const cfg = store.load();
      const playing = isTtsPlaying();
      if (cfg.tts.enabled && playing) {
        // 再生中 → 停止のみ（enabled は変更しない）
        const n = stopAllPlayback();
        new Notice(n > 0 ? `🔇 再生停止 (${n})` : '🔇 再生停止');
      } else {
        const next = !cfg.tts.enabled;
        store.save({ ...cfg, tts: { ...cfg.tts, enabled: next } });
        if (!next) stopAllPlayback();
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
    document.querySelectorAll(`[${MUTE_MARK}]`).forEach((el) => {
      const b = el as HTMLButtonElement;
      if (b.disabled) return;
      renderMute(b, computeMuteState(cfg.tts.enabled, playing));
    });
  };

  // アプリ内の設定変更を即時反映（設定タブ・CLI 同期等の全 save を捕捉）
  store.onSave(refreshAll);
  // 再生開始/終了を即時反映（点滅⇄固定切替）
  const offPlayback = onPlaybackChange(refreshAll);

  const inject = (toolbar: Element): void => {
    if (!toolbar.querySelector(`[${MUTE_MARK}]`)) {
      const btn = makeMuteButton(store, refreshAll);
      renderMute(btn, computeMuteState(store.load().tts.enabled, isTtsPlaying()));
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
