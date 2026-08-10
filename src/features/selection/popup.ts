import type { App } from 'obsidian';

export function buildPopup(app: App, onClaudian: () => void, onTts: () => void): HTMLElement {
  const div = document.createElement('div');
  div.classList.add('cb-popup');

  const btnClaudian = document.createElement('button');
  btnClaudian.classList.add('cb-action-btn');
  btnClaudian.textContent = 'Add to Claudian';
  btnClaudian.onclick = onClaudian;

  const btnTts = document.createElement('button');
  btnTts.classList.add('cb-action-btn');
  btnTts.textContent = 'Add to TTS';
  btnTts.onclick = onTts;

  div.appendChild(btnClaudian);
  div.appendChild(btnTts);
  return div;
}
