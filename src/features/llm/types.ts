/**
 * LlmClient インターフェースと共通型定義。
 * v0.40.0 (F-040): Think モード選択機能で追加。
 */

/** エフォートレベル。プロバイダごとに意味が異なる（low/medium/high のみ利用、'off' は enabled=false の意） */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high';

export const THINKING_EFFORT_VALUES = ['off', 'low', 'medium', 'high'] as const;

/** プロバイダ共通の Think モード設定 */
export interface ThinkingConfig {
  enabled: boolean;
  effort: ThinkingEffort;
}

/** LlmClient インターフェース（全プロバイダ実装の契約） */
export interface LlmClient {
  /** プロバイダ ID（設定 UI で表示用） */
  readonly id: 'claude' | 'deepseek' | 'kimi' | 'minimax' | 'zhipu';

  /**
   * 整形用プロンプトを実行し本文を返す。失敗・タイムアウト・空応答は null。
   * @param prompt 入力文（整形前）
   * @param opts.thinking Think モード設定
   * @param opts.timeoutMs 既定 30000
   * @param opts.signal AbortSignal（外部 abort 用）
   */
  runPrompt(
    prompt: string,
    opts: {
      thinking: ThinkingConfig;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<string | null>;
}
