/**
 * OpenVPN 関連の型定義。
 * v0.43.0 (F-041): ネットワークタブ・OpenVPN 接続機能で追加。
 */

export type OpenVpnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OpenVpnSettings {
  /** OpenVPN 機能の ON/OFF（既定 false） */
  enabled: boolean;
  /** .ovpn ファイル絶対パス */
  configPath: string;
  /** auth-user-pass ユーザー名 */
  username: string;
  /** auth-user-pass パスワード */
  password: string;
  /** LLM リクエスト時の自動接続（既定 true） */
  autoConnectOnLlm: boolean;
  /** openvpn CLI バイナリパス（空なら PATH 解決） */
  openvpnBinaryPath: string;
  /** サーバ上書き（v0.43.2 F-044）: host または host:port。空文字 = 無効（.ovpn の remote を使用） */
  serverOverride: string;
}

export const DEFAULT_OPEN_VPN_SETTINGS: OpenVpnSettings = {
  enabled: false,
  configPath: '',
  username: '',
  password: '',
  autoConnectOnLlm: true,
  openvpnBinaryPath: '',
  serverOverride: '',
};

/** F-046: dest/mask/gateway の3-tuple（VPN 関連ルートのみ） */
export type VpnRoute = {
  dest: string;
  mask: string;
  gateway: string;
};

/** F-046: removeStaleRoutes() の戻り値 */
export type RemoveStaleResult =
  | { ok: true; removed: number; failed: string[] }
  | { ok: false; reason: 'need-admin' | 'no-routes' | 'exec-failed'; detail: string };
