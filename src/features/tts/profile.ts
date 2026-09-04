/**
 * v0.36.0 (F-032): 聴き手プロファイル別の口調・用語変換。
 * 既存 MD 抽出 → フィルタ後に挟んで使う。
 */
export type ProfileId =
  | 'original' | 'workplace' | 'customer' | 'family'
  | 'classroom' | 'boss' | 'dr';

export const PROFILE_IDS: readonly ProfileId[] = [
  'original', 'workplace', 'customer', 'family',
  'classroom', 'boss', 'dr',
] as const;

/** プロファイル変換の薄いエントリ。各プロファイル固有処理は段階実装 */
export function applyProfileTransform(
  text: string,
  profile: ProfileId,
  termsMap: Map<string, string>,
): string {
  if (profile === 'original') return text;
  switch (profile) {
    case 'workplace':
      return transformWorkplace(text, termsMap);
    default:
      return text;
  }
}

/** 職場でよく出る略語の既定読みマップ */
const DEFAULT_ABBREVIATIONS: Record<string, string> = {
  api: 'エー ピー アイ',
  url: 'ユー アール エル',
  http: 'エー ティ ーティー ピー',
  https: 'エー ティ ーティー ピー エス',
  json: 'ジェイソン',
  yaml: 'ヤムル',
  cli: 'シー エル アイ',
  gui: 'ジー ユー アイ',
  ui: 'ユー アイ',
  ux: 'ユー エックス',
  css: 'シー エス エス',
  html: 'エイチ ティー エム エル',
  sql: 'エスキューエル',
  db: 'ディービー',
  os: 'オー エス',
  pdf: 'ピー ディー エフ',
  uri: 'ユー アー アイ',
  ai: 'エー アイ',
  ml: 'エム エル',
  sso: 'エス エス オー',
  oauth: 'オー オース',
  tls: 'ティー エル エス',
  ssl: 'エス エス エル',
  vpn: 'ブイ ピー エヌ',
  dns: 'ディー エヌ エス',
  api: 'エー ピー アイ',
};

const ASCII_CHAR_KATAKANA: Record<string, string> = {
  A: 'エー', B: 'ビー', C: 'シー', D: 'ディー', E: 'イー',
  F: 'エフ', G: 'ジー', H: 'エイチ', I: 'アイ', J: 'ジェー',
  K: 'ケー', L: 'エル', M: 'エム', N: 'エヌ', O: 'オー',
  P: 'ピー', Q: 'キュー', R: 'アール', S: 'エス', T: 'ティー',
  U: 'ユー', V: 'ブイ', W: 'ダブリュー', X: 'エックス',
  Y: 'ワイ', Z: 'ズィー',
};

function toKatakanaChar(c: string): string {
  return ASCII_CHAR_KATAKANA[c] ?? c;
}

/** ASCII 単語を略語置換（まず語全体、未登録で全大文字なら 1 文字ずつ） */
function expandAbbreviation(word: string): string {
  const lower = word.toLowerCase();
  if (DEFAULT_ABBREVIATIONS[lower] !== undefined) {
    return DEFAULT_ABBREVIATIONS[lower];
  }
  if (/^[A-Z]{2,}$/.test(word)) {
    return word.split('').map(toKatakanaChar).join(' ');
  }
  return word;
}

/** 職場プロファイル: 略語を 1 文字ずつ読み（または用語辞書で置換） */
function transformWorkplace(text: string, termsMap: Map<string, string>): string {
  return text.replace(/[A-Za-z]+/g, (word) => {
    if (termsMap.has(word)) return termsMap.get(word)!;
    return expandAbbreviation(word);
  });
}
