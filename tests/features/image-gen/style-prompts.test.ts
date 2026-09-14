import { describe, it, expect } from 'vitest';
import { applyStylePrompt, STYLE_PROMPTS, getStyleLabelKey } from '../../../src/features/image-gen/style-prompts';

describe('image-gen/style-prompts', () => {
  it('standard は userPrompt をそのまま返す', () => {
    expect(applyStylePrompt('standard', 'a cat')).toBe('a cat');
  });

  it('scientific は科学イラスト用プレフィックスを前置', () => {
    const out = applyStylePrompt('scientific', 'a cat');
    expect(out).toContain('Scientific illustration');
    expect(out.endsWith('a cat')).toBe(true);
  });

  it('anime はアニメ調プレフィックス', () => {
    const out = applyStylePrompt('anime', 'a cat');
    expect(out).toContain('Anime style');
  });

  it('photo は写真リアルプレフィックス', () => {
    const out = applyStylePrompt('photo', 'a cat');
    expect(out).toContain('Photorealistic');
  });

  it('全 4 スタイルにプレフィックス（standard は空）を定義', () => {
    expect(STYLE_PROMPTS.standard).toBe('');
    expect(STYLE_PROMPTS.scientific.length).toBeGreaterThan(50);
    expect(STYLE_PROMPTS.anime.length).toBeGreaterThan(50);
    expect(STYLE_PROMPTS.photo.length).toBeGreaterThan(50);
  });

  it('getStyleLabelKey は各スタイルに対応する i18n キーを返す', () => {
    expect(getStyleLabelKey('standard')).toBe('imageGenStyleStandard');
    expect(getStyleLabelKey('scientific')).toBe('imageGenStyleScientific');
    expect(getStyleLabelKey('anime')).toBe('imageGenStyleAnime');
    expect(getStyleLabelKey('photo')).toBe('imageGenStylePhoto');
  });
});
