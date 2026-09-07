import type { ImageGenStyle } from '../../core/settings';

/**
 * v0.38.0 (F-038): 画像スタイルごとのプロンプトプレフィックス。
 *
 * ユーザ入力をそのまま送ると意図と離れた絵が出るため、
 * スタイル別に英語プレフィックスを前置して API に意図を伝達する。
 *
 * - `scientific`: scientific-illustrator スキル相当（インフォグラフィック風）
 * - `anime`: アニメ調（Studio Ghibli 風モーション感）
 * - `photo`: 写真リアル
 * - `standard`: プレフィックスなし（API 既定）
 */
export const STYLE_PROMPTS: Record<ImageGenStyle, string> = {
  standard: '',
  scientific:
    'Scientific illustration, clean infographic style, 16:9 layout, ' +
    'labeled diagram with clear typography, technical accuracy, ' +
    'professional academic visual, motion lines and feedback loops, ' +
    'color-coded comparison, Ghibli-esque subtle motion blur: ',
  anime:
    'Anime style illustration, Studio Ghibli aesthetic, vibrant colors, ' +
    'dynamic motion lines, expressive characters, painterly background, ' +
    'soft natural lighting, cinematic composition: ',
  photo:
    'Photorealistic photograph, high resolution 4K, natural lighting, ' +
    'sharp focus, accurate colors, professional DSLR quality, ' +
    'real-world textures: ',
};

/**
 * スタイルプレフィックスを適用した最終プロンプトを生成する。
 * @param style 選択中のスタイル
 * @param userPrompt ユーザが入力したプロンプト
 * @returns API に送るプロンプト
 */
export function applyStylePrompt(style: ImageGenStyle, userPrompt: string): string {
  const prefix = STYLE_PROMPTS[style];
  if (!prefix) return userPrompt;
  return prefix + userPrompt;
}

/**
 * スタイル名の i18n キー
 */
export function getStyleLabelKey(style: ImageGenStyle): string {
  switch (style) {
    case 'standard': return 'imageGenStyleStandard';
    case 'scientific': return 'imageGenStyleScientific';
    case 'anime': return 'imageGenStyleAnime';
    case 'photo': return 'imageGenStylePhoto';
  }
}
