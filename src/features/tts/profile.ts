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
  // 段階実装(Task 2-7)で switch 分岐を展開。v0.36.0 初回は original のみ動作。
  return text;
}
