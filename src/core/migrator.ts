/**
 * v0.6.0 TTS 簡素化マイグレーション
 *
 * 旧 `data.json.tts` 形式（minimax ブロック・`voice` 単一フィールド・平型 voices）を
 * 新形式（`engine: 'edge' | 'webspeech'` + `voices: { edge, webspeech }` ネスト型）に移行し、
 * ユーザーに Notice を 1 回だけ通知する。
 */
import * as fs from 'fs';
import type { ClaudianBridgeSettings } from './settings';

export const TTS_MIGRATION_NOTICE =
  '🗑️ MiniMax TTS 設定を削除しました（接続テスト失敗のため）。新しい edge-TTS / WebSpeech 設定は「設定 → Claudian Bridge → テキスト読み上げ」をご確認ください。';

export type NoticeFn = (message: string) => void;

/**
 * マイグレーション中に発生する変更を記録するバックアップインターフェース。
 * テスト容易性のため関数ベースで注入可能。
 */
export interface MigratorBackup {
  record(message: string): void;
}

/** デフォルトの backup（console.warn に流す） */
const defaultBackup: MigratorBackup = {
  record(message: string): void {
    console.warn(`[claudian-bridge][migrator] ${message}`);
  },
};

/** v0.27.0: edge → edge-local 自動変換 */
export function migrateEdgeToEdgeLocal(
  tts: unknown,
  backup: MigratorBackup,
): void {
  if (typeof tts !== 'object' || tts === null) return;
  const t = tts as { engine?: string };
  if (t.engine === 'edge') {
    backup.record('tts.engine: edge → edge-local (v0.27.0 — デフォルト切替)');
    t.engine = 'edge-local';
  }
}

/** 旧フィールド検出（normalize 前の生データに対して） */
export function detectRemovedTtsFields(raw: unknown): string[] {
  const removed: string[] = [];
  const tts = (raw && typeof raw === 'object' && (raw as Record<string, unknown>).tts) as Record<string, unknown> | undefined;
  if (!tts) return removed;
  if ('minimax' in tts) removed.push('tts.minimax');
  if ('voice' in tts) removed.push('tts.voice');
  // 平型 voices（旧 { voices: { zh, ja, en } }）の検出
  const voices = tts.voices as Record<string, unknown> | undefined;
  if (voices && typeof voices === 'object') {
    const flatKeys = ['zh', 'ja', 'en'].filter((k) => k in voices);
    const nestedKeys = ['edge', 'webspeech'].filter((k) => k in voices);
    if (flatKeys.length > 0 && nestedKeys.length === 0) {
      removed.push('tts.voices[flat]');
    }
  }
  return removed;
}

interface MigrationStoreLike {
  configPath: string;
  load(): ClaudianBridgeSettings;
  save(cfg: ClaudianBridgeSettings): void;
}

/**
 * マイグレーションを実行する。
 * - 既に通知済み (`general.ttsMigrationNotified === true`) の場合は何もしない
 * - 旧フィールドが無い場合も何もしない
 * - 旧フィールドがあればクリーン済み cfg を saveData + Notice を 1 回
 *
 * @returns マイグレーションを実行したかと検出された旧フィールド
 */
export function runTtsMigration(
  store: MigrationStoreLike,
  noticeFn: NoticeFn,
): { executed: boolean; removed: string[] } {
  // 生 data.json を読み込み
  let raw: unknown = {};
  try {
    if (fs.existsSync(store.configPath)) {
      raw = JSON.parse(fs.readFileSync(store.configPath, 'utf-8'));
    }
  } catch {
    // 破損 JSON は ConfigStore.load() 側で .broken.json に退避済み → 何もしない
    return { executed: false, removed: [] };
  }

  // v0.27.0: edge → edge-local 自動変換（生 data.json レベルで実施）
  const ttsBlock = (raw && typeof raw === 'object')
    ? (raw as Record<string, unknown>).tts
    : undefined;
  migrateEdgeToEdgeLocal(ttsBlock, defaultBackup);

  const removed = detectRemovedTtsFields(raw);
  if (removed.length === 0) return { executed: false, removed };

  const cfg = store.load();
  const general = cfg.general as unknown as { ttsMigrationNotified?: boolean };
  if (general.ttsMigrationNotified === true) return { executed: false, removed };

  // フラグ付与して保存
  const nextGeneral = {
    ...cfg.general,
    ttsMigrationNotified: true,
  } as ClaudianBridgeSettings['general'];
  const next: ClaudianBridgeSettings = {
    ...cfg,
    general: nextGeneral,
  };
  store.save(next);
  noticeFn(TTS_MIGRATION_NOTICE);
  return { executed: true, removed };
}
