import { describe, it, expect } from 'vitest';
import {
  clampRefreshSec,
  QUOTA_REFRESH_MIN_SEC,
  QUOTA_REFRESH_MAX_SEC,
  clampSwitchSec,
  DEFAULT_QUOTA_SWITCH_SEC,
  QUOTA_SWITCH_MIN_SEC,
  QUOTA_SWITCH_MAX_SEC,
} from '../../../src/features/quota/types';

describe('clampRefreshSec', () => {
  it('範囲内の値はそのまま返す', () => {
    expect(clampRefreshSec(60)).toBe(60);
    expect(clampRefreshSec(120)).toBe(120);
  });

  it('下限未満は MIN にクランプ', () => {
    expect(clampRefreshSec(0)).toBe(QUOTA_REFRESH_MIN_SEC);
    expect(clampRefreshSec(-5)).toBe(QUOTA_REFRESH_MIN_SEC);
    expect(clampRefreshSec(5)).toBe(QUOTA_REFRESH_MIN_SEC);
  });

  it('上限超過は MAX にクランプ', () => {
    expect(clampRefreshSec(9999)).toBe(QUOTA_REFRESH_MAX_SEC);
  });

  it('NaN はデフォルト 60', () => {
    expect(clampRefreshSec(NaN)).toBe(60);
  });

  it('小数は切り捨て', () => {
    expect(clampRefreshSec(60.7)).toBe(60);
  });

  it('非数値（string）はデフォルト 60', () => {
    expect(clampRefreshSec('abc' as unknown as number)).toBe(60);
  });
});

describe('clampSwitchSec', () => {
  it('デフォルト 30', () => {
    expect(DEFAULT_QUOTA_SWITCH_SEC).toBe(30);
    expect(clampSwitchSec(undefined)).toBe(30);
    expect(clampSwitchSec('bad' as unknown as number)).toBe(30);
  });

  it('範囲 [5, 600] にクランプ', () => {
    expect(clampSwitchSec(1)).toBe(QUOTA_SWITCH_MIN_SEC);
    expect(clampSwitchSec(9999)).toBe(QUOTA_SWITCH_MAX_SEC);
    expect(clampSwitchSec(45.7)).toBe(45);
  });
});
