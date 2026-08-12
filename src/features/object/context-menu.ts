import { Menu, type App, type Plugin } from 'obsidian';
import { getMeaningfulInfo, normalizeObjectType, normalizeObjectContext, type ObjectContextCategory, type ObjectTypeCategory } from './inspector';
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

export interface ObjectMenuTypeFlags {
  button: boolean;
  input: boolean;
  link: boolean;
  element: boolean;
}
export interface ObjectMenuContextFlags {
  ribbon: boolean;
  sidebar: boolean;
  modal: boolean;
  settings: boolean;
  menu: boolean;
  workspace: boolean;
}

export interface ObjectMenuStore {
  load(): {
    selection: {
      objectMenuEnabled: boolean;
      objectMenuExcludeSelectors: string[];
      objectMenuTypeFlags: ObjectMenuTypeFlags;
      objectMenuContextFlags: ObjectMenuContextFlags;
    };
  };
}

/** type/context フラグに基づいて表示可否を判定 */
export function isMenuAllowedFor(
  type: ObjectTypeCategory,
  context: ObjectContextCategory,
  flags: { objectMenuTypeFlags: ObjectMenuTypeFlags; objectMenuContextFlags: ObjectMenuContextFlags },
): boolean {
  const t = flags.objectMenuTypeFlags?.[type] ?? true;
  const c = flags.objectMenuContextFlags?.[context] ?? true;
  return t && c;
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

    // v0.5.0: type/context ごとの有効/無効フィルタ
    const typeCat = normalizeObjectType(info.type, target.tagName);
    const ctxCat = normalizeObjectContext(info.context);
    if (!isMenuAllowedFor(typeCat, ctxCat, settings)) return;

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
