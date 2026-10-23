/**
 * v0.57.1 (F-060): Claudian（realclaudian）の内部 API アクセサ。
 *
 * Claudian 2.3.29 で `activateView()` / `getView()` が **プラグイン直下から
 * `plugin.views` へ移動**した。旧パスのまま呼ぶと `getView()` が undefined を返し、
 * 「Claudian チャットが準備できていません」で全連携機能が静かに失敗する。
 *
 * 本モジュールは新旧両対応の解決を一元化し、起動時に API 形状を検査する。
 */

/** ビュー操作 API。実体はクラスインスタンス（メソッドは minify 後も名前を維持） */
export interface ClaudianViewApi {
  activateView?: () => Promise<unknown>;
  getView?: () => unknown;
  getAllViews?: () => unknown[];
}

/** realclaudian プラグイン本体（2.3.29 以降は views 配下に API を持つ） */
export interface ClaudianPlugin extends ClaudianViewApi {
  views?: ClaudianViewApi;
  manifest?: { version?: string };
}

export interface ClaudianApiStatus {
  /** ok=利用可能 / missing-plugin=未導入・無効 / missing-api=API 形状変更 */
  status: 'ok' | 'missing-plugin' | 'missing-api';
  /** API を発見した場所 */
  apiPath?: 'root' | 'views';
  version?: string;
}

export function getClaudianPlugin(app: unknown): ClaudianPlugin | undefined {
  return (app as { plugins?: { plugins?: Record<string, ClaudianPlugin | undefined> } })
    ?.plugins?.plugins?.['realclaudian'];
}

/**
 * ビュー操作 API を持つオブジェクトを解決する。
 * 旧 API（plugin 直下）を優先し、無ければ新 API（plugin.views）を使う。
 */
export function resolveClaudianViewApi(p: ClaudianPlugin): ClaudianViewApi {
  return typeof p.getView === 'function' ? p : (p.views ?? p);
}

/** 起動時検査。API が想定形状でなければ missing-api を返す */
export function checkClaudianApi(app: unknown): ClaudianApiStatus {
  const p = getClaudianPlugin(app);
  if (!p) return { status: 'missing-plugin' };
  const version = p.manifest?.version;
  if (typeof p.getView === 'function') return { status: 'ok', apiPath: 'root', version };
  if (typeof p.views?.getView === 'function') return { status: 'ok', apiPath: 'views', version };
  return { status: 'missing-api', version };
}
