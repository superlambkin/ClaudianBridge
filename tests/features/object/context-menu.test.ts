// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { isExcluded, isMenuAllowedFor } from '../../../src/features/object/context-menu';
import { normalizeObjectType, normalizeObjectContext } from '../../../src/features/object/inspector';

describe('isExcluded', () => {
  it('除外セレクタにマッチすれば true', () => {
    const div = document.createElement('div');
    div.classList.add('cb-popup');
    document.body.appendChild(div);
    expect(isExcluded(div, ['.cb-popup'])).toBe(true);
    document.body.removeChild(div);
  });

  it('マッチしなければ false', () => {
    const btn = document.createElement('button');
    btn.classList.add('foo');
    document.body.appendChild(btn);
    expect(isExcluded(btn, ['.cb-popup', '.menu'])).toBe(false);
    document.body.removeChild(btn);
  });

  it('複数の除外セレクタのいずれかにマッチすれば true', () => {
    const div = document.createElement('div');
    div.classList.add('menu');
    document.body.appendChild(div);
    expect(isExcluded(div, ['.cb-popup', '.menu'])).toBe(true);
    document.body.removeChild(div);
  });

  it('空の除外リストは常に false', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(isExcluded(div, [])).toBe(false);
    document.body.removeChild(div);
  });
});

describe('isMenuAllowedFor', () => {
  const allOn = {
    objectMenuTypeFlags: { button: true, input: true, link: true, element: true },
    objectMenuContextFlags: { ribbon: true, sidebar: true, modal: true, settings: true, menu: true, workspace: true },
  };

  it('全ONなら許可', () => {
    expect(isMenuAllowedFor('button', 'ribbon', allOn)).toBe(true);
  });

  it('type OFF なら不許可', () => {
    expect(isMenuAllowedFor('button', 'ribbon', { ...allOn, objectMenuTypeFlags: { ...allOn.objectMenuTypeFlags, button: false } })).toBe(false);
  });

  it('context OFF なら不許可', () => {
    expect(isMenuAllowedFor('button', 'modal', { ...allOn, objectMenuContextFlags: { ...allOn.objectMenuContextFlags, modal: false } })).toBe(false);
  });

  it('フラグ欠落時は true（後方互換）', () => {
    expect(isMenuAllowedFor('button', 'ribbon', { objectMenuTypeFlags: {} as never, objectMenuContextFlags: {} as never })).toBe(true);
  });
});

describe('normalizeObjectType', () => {
  it('role=button → button', () => {
    expect(normalizeObjectType('button')).toBe('button');
  });
  it('role=menuitem/tab/switch → button', () => {
    expect(normalizeObjectType('menuitem')).toBe('button');
    expect(normalizeObjectType('tab')).toBe('button');
    expect(normalizeObjectType('switch')).toBe('button');
  });
  it('role=checkbox/radio/slider/option → input', () => {
    expect(normalizeObjectType('checkbox')).toBe('input');
    expect(normalizeObjectType('radio')).toBe('input');
    expect(normalizeObjectType('slider')).toBe('input');
    expect(normalizeObjectType('option')).toBe('input');
  });
  it('role=link → link', () => {
    expect(normalizeObjectType('link')).toBe('link');
  });
  it('element + tag=a → link', () => {
    expect(normalizeObjectType('element', 'a')).toBe('link');
  });
  it('element + tag=input → input', () => {
    expect(normalizeObjectType('element', 'input')).toBe('input');
  });
  it('未知 type → element', () => {
    expect(normalizeObjectType('unknown')).toBe('element');
  });
});

describe('normalizeObjectContext', () => {
  it('既知 context はそのまま', () => {
    expect(normalizeObjectContext('ribbon')).toBe('ribbon');
    expect(normalizeObjectContext('sidebar')).toBe('sidebar');
    expect(normalizeObjectContext('settings')).toBe('settings');
  });
  it('未知 context → workspace', () => {
    expect(normalizeObjectContext('unknown')).toBe('workspace');
  });
});
