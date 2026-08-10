// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { isExcluded } from '../../../src/features/object/context-menu';

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
