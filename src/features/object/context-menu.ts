import { Menu, type App, type Plugin } from 'obsidian';
import { getMeaningfulInfo, type ObjectInfo } from './inspector';
import { formatObject } from './formatter';
import { addTextToClaudian } from '../selection/core';

export function isExcluded(el: HTMLElement, excludeSelectors: string[]): boolean {
  if (!excludeSelectors || excludeSelectors.length === 0) return false;
  return excludeSelectors.some((sel) => {
    try {
      return el.closest(sel) !== null;
    } catch {
      return false;
    }
  });
}

export interface ObjectMenuStore {
  load(): {
    selection: {
      objectMenuEnabled: boolean;
      objectMenuExcludeSelectors: string[];
    };
  };
}

export function registerObjectContextMenu(plugin: Plugin, store: ObjectMenuStore): void {
  plugin.registerDomEvent(document, 'contextmenu', (evt: MouseEvent) => {
    const settings = store.load().selection;
    if (!settings.objectMenuEnabled) return;

    const target = evt.target;
    if (!(target instanceof HTMLElement)) return;
    if (isExcluded(target, settings.objectMenuExcludeSelectors)) return;

    const info = getMeaningfulInfo(target);
    if (!info) return; // 意味なし要素 → 何もしない (既存メニュー表示)

    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle('Add to Claudian')
        .setIcon('message-square-plus')
        .onClick(async () => {
          const markdown = formatObject(info);
          await addTextToClaudian((plugin as unknown as { app: App }).app, markdown);
        })
    );
    menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
    evt.preventDefault();
  });
}
