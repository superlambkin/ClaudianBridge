import { describe, it, expect } from 'vitest';
import {
  checkClaudianApi,
  getClaudianPlugin,
  resolveClaudianViewApi,
  type ClaudianPlugin,
} from '../../src/core/claudian-api';

function makeApp(realclaudian?: unknown) {
  return { plugins: { plugins: { realclaudian } } } as unknown;
}

describe('getClaudianPlugin', () => {
  it('realclaudian プラグインを返す', () => {
    const p: ClaudianPlugin = { getView: () => null };
    expect(getClaudianPlugin(makeApp(p))).toBe(p);
  });

  it('未導入なら undefined', () => {
    expect(getClaudianPlugin(makeApp(undefined))).toBeUndefined();
  });
});

describe('resolveClaudianViewApi', () => {
  it('旧 API（plugin 直下の getView）を優先する', () => {
    const root = { getView: () => 'root' };
    const p: ClaudianPlugin = { ...root, views: { getView: () => 'views' } };
    expect(resolveClaudianViewApi(p)).toBe(p);
  });

  it('旧 API が無ければ plugin.views を返す（v2.3.29 以降）', () => {
    const views = { getView: () => 'views' };
    const p: ClaudianPlugin = { views };
    expect(resolveClaudianViewApi(p)).toBe(views);
  });

  it('どちらも無ければ plugin 自身を返す（呼び出し側で undefined 判定）', () => {
    const p: ClaudianPlugin = {};
    expect(resolveClaudianViewApi(p)).toBe(p);
  });

  // M2: 旧 API（plugin 直下）に getView が無いのに activateView だけが
  // ある「部分形状」の場合、root を選ぶと activateView が解決できない。
  it('M2: root に getView が無く activateView のみなら views を優先する', () => {
    const views = { getView: () => 'views', activateView: () => 'activated' };
    const p = { activateView: () => 'root-activated', views } as unknown as ClaudianPlugin;
    expect(resolveClaudianViewApi(p)).toBe(views);
  });

  it('M2: root に getView も activateView も無ければ views を返す', () => {
    const views = { getView: () => 'views' };
    const p = { views } as unknown as ClaudianPlugin;
    expect(resolveClaudianViewApi(p)).toBe(views);
  });
});

describe('checkClaudianApi', () => {
  it('旧 API 形状 → ok / root', () => {
    expect(checkClaudianApi(makeApp({ manifest: { version: '2.2.0' }, getView: () => null })))
      .toEqual({ status: 'ok', apiPath: 'root', version: '2.2.0' });
  });

  it('新 API 形状 → ok / views', () => {
    expect(checkClaudianApi(makeApp({ manifest: { version: '2.3.29' }, views: { getView: () => null } })))
      .toEqual({ status: 'ok', apiPath: 'views', version: '2.3.29' });
  });

  it('プラグイン未導入 → missing-plugin', () => {
    expect(checkClaudianApi(makeApp(undefined))).toEqual({ status: 'missing-plugin' });
  });

  it('プラグインは在るが getView が無い → missing-api', () => {
    expect(checkClaudianApi(makeApp({ manifest: { version: '3.0.0' } })))
      .toEqual({ status: 'missing-api', version: '3.0.0' });
  });
});
