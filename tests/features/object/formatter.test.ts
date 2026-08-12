import { describe, it, expect } from 'vitest';
import { formatObject } from '../../../src/features/object/formatter';
import type { ObjectInfo } from '../../../src/features/object/inspector';

const sample: ObjectInfo = {
  name: 'Open Claudian',
  type: 'button',
  selector: ".ribbon-item[aria-label='Open Claudian']",
  path: '.workspace-ribbon > div.ribbon-item-group > .ribbon-item',
  context: 'ribbon',
};

describe('formatObject', () => {
  it('@object[type] ヘッダを含む', () => {
    const out = formatObject(sample);
    expect(out).toMatch(/^@object\[button\]/m);
  });

  it('name, type, context, selector, path をすべて含む', () => {
    const out = formatObject(sample);
    expect(out).toContain('name: Open Claudian');
    expect(out).toContain('type: button');
    expect(out).toContain('context: ribbon');
    expect(out).toContain("selector: .ribbon-item[aria-label='Open Claudian']");
    expect(out).toContain('path: .workspace-ribbon');
  });

  it('context が unknown の場合は省略', () => {
    const out = formatObject({ ...sample, context: 'unknown' });
    expect(out).not.toContain('context:');
  });

  it('attributes がある場合は末尾に追加', () => {
    const out = formatObject({ ...sample, attributes: { 'aria-label': 'Open Claudian' } });
    expect(out).toMatch(/attributes:.*aria-label/m);
  });
});