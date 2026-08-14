import * as fs from 'fs';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigStore } from '../../src/core/config-store';
import { DEFAULT_CLAUDIAN_BRIDGE_SETTINGS } from '../../src/core/settings';

// fs.watch を制御するため fs モジュールをモック（他メソッドは実物を使用）
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    watch: vi.fn(),
  };
});

const watchMock = vi.mocked(fs.watch);

let dir: string;
let configPath: string;
let store: ConfigStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cb-test-'));
  configPath = join(dir, 'data.json');
  store = new ConfigStore(configPath);
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('ConfigStore', () => {
  it('ファイル不在ならデフォルトで作成して返す', () => {
    const cfg = store.load();
    expect(cfg).toEqual(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS);
    expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS);
  });

  it('既存ファイルを読み込む', () => {
    writeFileSync(configPath, JSON.stringify({ selection: { delayMs: 500 } }));
    expect(store.load().selection.delayMs).toBe(500);
  });

  it('欠落キーはデフォルトでマージされる', () => {
    writeFileSync(configPath, JSON.stringify({ general: { enabled: false } }));
    const cfg = store.load();
    expect(cfg.general.enabled).toBe(false);
    expect(cfg.tts.engine).toBe(DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts.engine);
  });

  it('save 後 load で round-trip', () => {
    const next = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, selection: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.selection, delayMs: 999 } };
    store.save(next);
    expect(store.load().selection.delayMs).toBe(999);
  });

  it('不正な値 → 例外', () => {
    const bad = { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS, tts: { ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS.tts, engine: 'unknown' as unknown as 'edge' } };
    expect(() => store.save(bad)).toThrow(/tts.engine/);
  });

  it('fs.watch が失敗する環境でも watch() は例外を投げずポーリングにフォールバックする', async () => {
    // ネットワークドライブ (SMB 等) を模して fs.watch を同期 throw させる
    watchMock.mockImplementation(() => {
      throw new Error('UNKNOWN: unknown error, watch');
    });

    try {
      writeFileSync(configPath, JSON.stringify({ selection: { delayMs: 100 } }));
      const onChange = vi.fn();

      // watch() 自体は例外を投げない
      expect(() => store.watch(onChange)).not.toThrow();

      // ポーリング初回 (基準 mtime 記録)
      await new Promise((r) => setTimeout(r, 1100));

      // 外部からファイルを変更 (self-write 扱いにさせないため直接書き込み + mtime 更新)
      writeFileSync(configPath, JSON.stringify({ selection: { delayMs: 200 } }));
      const newTime = new Date(Date.now() + 2000);
      utimesSync(configPath, newTime, newTime);

      // ポーリング検知 + debounce 300ms を待つ
      await new Promise((r) => setTimeout(r, 1600));

      expect(onChange).toHaveBeenCalled();
    } finally {
      watchMock.mockReset();
      store.close();
    }
  }, 10000);

  it('fs.watch が error イベントを発火してもポーリングにフォールバックして監視を継続する', async () => {
    // error イベントを発火する疑似 watcher を返す
    const fakeWatcher = {
      on: vi.fn(),
      close: vi.fn(),
    };
    watchMock.mockReturnValue(fakeWatcher as unknown as ReturnType<typeof fs.watch>);

    try {
      writeFileSync(configPath, JSON.stringify({ selection: { delayMs: 100 } }));
      const onChange = vi.fn();
      store.watch(onChange);

      // fs.watch の error ハンドラが登録されていることを確認
      expect(fakeWatcher.on).toHaveBeenCalledWith('error', expect.any(Function));

      // error イベントを発火 → フォールバック
      const errorHandler = fakeWatcher.on.mock.calls.find(([ev]) => ev === 'error')?.[1] as () => void;
      errorHandler();

      // ポーリング初回 (基準 mtime 記録)
      await new Promise((r) => setTimeout(r, 1100));

      // 外部から変更
      writeFileSync(configPath, JSON.stringify({ selection: { delayMs: 300 } }));
      const newTime = new Date(Date.now() + 2000);
      utimesSync(configPath, newTime, newTime);

      await new Promise((r) => setTimeout(r, 1600));

      expect(onChange).toHaveBeenCalled();
    } finally {
      watchMock.mockReset();
      store.close();
    }
  }, 10000);
});

describe('onSave subscriber (v0.10.0)', () => {
  it('save() 成功時に listener が呼ばれる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-config-'));
    const file = join(dir, 'data.json');
    const store = new ConfigStore(file);
    const listener = vi.fn();
    store.onSave(listener);
    store.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ general: expect.objectContaining({ enabled: true }) }));
  });

  it('listener が throw しても save は成功する', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-config-'));
    const file = join(dir, 'data.json');
    const store = new ConfigStore(file);
    store.onSave(() => { throw new Error('listener boom'); });
    expect(() => store.save({ ...DEFAULT_CLAUDIAN_BRIDGE_SETTINGS })).not.toThrow();
    expect(fs.existsSync(file)).toBe(true);
  });
});
