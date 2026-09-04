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
    case 'customer':
      return transformCustomer(text, termsMap);
    case 'family':
      return transformFamily(text, termsMap);
    case 'classroom':
      return transformClassroom(text, termsMap);
    case 'boss':
      return transformBoss(text);
    case 'dr':
      return transformDr(text);
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

/** 顧客向け: コードフェンス除去 + 丁寧語化 + 略語展開 */
function transformCustomer(text: string, termsMap: Map<string, string>): string {
  let t = text.replace(/```[a-zA-Z]*\n[\s\S]*?\n```/g, 'コードブロック省略');
  t = t.replace(/```[\s\S]*?```/g, 'コードブロック省略');
  // 簡易丁寧語化: 「だ。」→「です。」
  t = t.replace(/([^。\n]*)だ(?=[。\n])/g, '$1です');
  // 略語も展開（customer は一般語展開はしない、職場と同じ 1 文字読みで統一）
  t = t.replace(/[A-Za-z]+/g, (word) => {
    if (termsMap.has(word)) return termsMap.get(word)!;
    return expandAbbreviation(word);
  });
  return t;
}

/** 数字を漢数字に変換（0-9999）。1万超はアラビア数字のまま */
const KANJI_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function toKanjiNumber(n: number): string {
  if (n === 0) return '零';
  if (n >= 10000) return String(n);
  const k = (h: number, c: string) => h === 0 ? c : (h === 1 ? '' : KANJI_DIGITS[h]) + c;
  const sen = Math.floor(n / 1000);
  const hyaku = Math.floor((n % 1000) / 100);
  const ju = Math.floor((n % 100) / 10);
  const ichi = n % 10;
  return (sen > 0 ? k(sen, '千') : '') + (hyaku > 0 ? k(hyaku, '百') : '') + (ju > 0 ? k(ju, '十') : '') + (ichi > 0 ? KANJI_DIGITS[ichi] : '');
}

/** 家族: コードフェンス除外 + 数字漢数字 + 略語展開（用語辞書優先） */
function transformFamily(text: string, termsMap: Map<string, string>): string {
  let t = text.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/\d+/g, (m) => toKanjiNumber(Number(m)));
  t = t.replace(/[A-Za-z]+/g, (word) => {
    if (termsMap.has(word)) return termsMap.get(word)!;
    return expandAbbreviation(word);
  });
  return t;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 教室: 用語辞書の語直後に「とは 〇〇」を付記 */
function transformClassroom(text: string, termsMap: Map<string, string>): string {
  let t = text;
  for (const [term, gloss] of termsMap) {
    t = t.replace(new RegExp(`(${escapeRegExp(term)})(?![とは])`, 'g'),
      `${term} とは ${gloss}`);
  }
  return t;
}

/** 上司: 🎯 結論 見出し前にマーカー付与 + 数字漢数字（並び順は呼び出し側チャンクで実施） */
function transformBoss(text: string): string {
  // 必ず行頭で判定するため `m` フラグ＋^ で行頭一致にする。
  // 注: 日本語の直後に \b（単語境界）は機能しない（\w は ASCII のみ）ため使用しない
  let t = text.replace(/^## 🎯 結論([^\n]*)/gm, '結論：## 🎯 結論$1');
  t = t.replace(/^## (?!🎯 )([^\n]*)/gm, '詳細：## $1');
  t = t.replace(/\d+/g, (m) => toKanjiNumber(Number(m)));
  return t;
}

/** DR: 誤字疑い箇所に [BEEP]、修正提案に TODO: を付与 */
function transformDr(text: string): string {
  let t = text;
  // 誤字疑いキーワード
  t = t.replace(/(原文ママ|TBD|FIXME|XXX|HACK|要修正|誤字|typo)/gi, '[BEEP] $& [BEEP]');
  // 修正提案: 「修正：」「修正：」「修正：」始まりを TODO: に
  t = t.replace(/^(修正[：:])\s*/gm, 'TODO: ');
  return t;
}
