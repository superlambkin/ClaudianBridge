import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readLegacyDataJson } from '../../src/legacy/read-legacy';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cb-read-legacy-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('readLegacyDataJson', () => {
  it('存在しないプラグイン → null', () => {
    expect(readLegacyDataJson(dir, 'unknown')).toBeNull();
  });
  it('破損JSON → null', () => {
    mkdirSync(join(dir, 'broken'));
    writeFileSync(join(dir, 'broken', 'data.json'), '{ broken !!!');
    expect(readLegacyDataJson(dir, 'broken')).toBeNull();
  });
  it('正常なJSON → パース結果を返す', () => {
    mkdirSync(join(dir, 'ok'));
    writeFileSync(join(dir, 'ok', 'data.json'), JSON.stringify({ x: 1 }));
    expect(readLegacyDataJson(dir, 'ok')).toEqual({ x: 1 });
  });
});
