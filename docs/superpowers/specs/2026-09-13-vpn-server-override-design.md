# Server Override（サーバ上書き）機能 設計仕様書

> 📂 パス：docs/superpowers/specs/2026-09-13-vpn-server-override-design.md
> 📍 源码：D:\AI-Agent\ClaudianBridge\src\features\network\、src\settings\SettingTabNetwork.ts、src\core\settings.ts
> 🏷️ バージョン：v1.0（2026-09-13 設計・承認待ち）
> 🔗 機能番号：F-044（Server Override）
> 🔗 関連：F-041（OpenVPN 接続）/ F-042（ネットワークタブ）

---

## 1. 背景・目的

F-041 で実装した OpenVPN 接続は、`.ovpn` ファイル内の `remote` ディレクティブ（固定 IP: `118.105.79.130 1194`）に依存する。

R10 T11 補遺検証で「グローバル IP 変動」が原因仮説として挙げられており、動的 IP 環境では `.ovpn` の IP が陳腐化すると接続不能になる。

DDNS（例: `xxxx.myqnapcloud.com`）を設定すれば IP 変動に追従できるが、`.ovpn` を手動編集するのは運用上煩雑。**設定画面からサーバアドレスを上書きできるようにする**。

| # | 現状課題 |
|:-:|----------|
| A | `.ovpn` の remote が固定 IP で、グローバル IP 変動時に手動修正が必要 |
| B | DDNS ドメインを持っていてもプラグインから使う手段がない |

本設計で次を実現する：

| # | 項目 |
|:-:|------|
| A | ネットワークタブに「サーバ上書き」設定を追加（`host` または `host:port` 形式） |
| B | openvpn CLI 標準の `--remote` 引数による上書きを利用（プラグイン側の DNS 解決は行わない） |

---

## 2. 要件（決定済み）

| # | 要件 | 決定 |
|:-:|------|------|
| R1 | 設定キー | `network.openvpn.serverOverride: string`（既定 `''` = 無効） |
| R2 | 入力形式 | `host` または `host:port`（port 省略時は `1194` を使用） |
| R3 | 上書き方式 | openvpn CLI の `--remote <host> <port>` 引数（設定ファイルの remote より優先される標準動作） |
| R4 | DNS 解決 | **openvpn が実行時に解決**（プラグイン側は解決しない・IP 取得ロジックは持たない） |
| R5 | 後方互換 | 空欄時は従来どおり `.ovpn` の remote を使用（既存ユーザーへの影響なし） |
| R6 | 検証 | `host:port` の port 部が 1-65535 の数値でない場合は validate エラー |
| R7 | UI | ネットワークタブの OpenVPN セクションにテキスト項目 1 個追加 |
| R8 | i18n | 2 キー × 3 言語（ja/en/zh-CN） |
| R9 | リリース | v0.43.2 |
| R10 | 機能番号 | F-044 |

---

## 3. 設計

### 3.1 データモデル

```typescript
// src/features/network/types.ts への追加
export interface OpenVpnSettings {
  // ... 既存 6 フィールド
  /** サーバ上書き（host または host:port。空文字 = 無効） */
  serverOverride: string;
}

export const DEFAULT_OPEN_VPN_SETTINGS: OpenVpnSettings = {
  // ... 既存
  serverOverride: '',
};
```

### 3.2 normalize / validate

```typescript
// normalizeOpenVpnSettings に追加
serverOverride: typeof r.serverOverride === 'string' ? r.serverOverride : '',

// validateClaudianBridgeSettings に追加
if (typeof cfg.network.openvpn.serverOverride !== 'string') return 'network.openvpn.serverOverride は string である必要があります';
if (cfg.network.openvpn.serverOverride) {
  const parts = cfg.network.openvpn.serverOverride.split(':');
  if (parts.length > 2) return 'network.openvpn.serverOverride は host または host:port 形式で指定してください';
  if (parts.length === 2 && (!/^\d+$/.test(parts[1]) || Number(parts[1]) < 1 || Number(parts[1]) > 65535)) {
    return 'network.openvpn.serverOverride の port は 1-65535 の数値で指定してください';
  }
}
```

### 3.3 openvpn.ts への引数追加

```typescript
// start() 内、args 構築後に追加
if (settings.serverOverride) {
  const [host, port] = settings.serverOverride.split(':');
  args.push('--remote', host, port || '1194');
}
// → openvpn --config <file> --remote <host> <port> ... （CLI 引数は config ファイルより優先）
```

### 3.4 UI（SettingTabNetwork）

OpenVPN セクションの `networkOpenVpnBinaryPath` の後に追加：

| 設定 | 値 |
|------|------|
| 名前 | `🌐 サーバ上書き（任意）` / `🌐 Server override (optional)` / `🌐 服务器覆盖（可选）` |
| 説明 | `ドメイン名で接続先を上書きします。例: myqnap.myqnapcloud.com または myqnap.example.com:1194。空欄 = .ovpn の設定を使用` |
| 入力 | テキスト 1 行 |

### 3.5 i18n キー

| キー | ja | en | zh-CN |
|------|----|----|-------|
| `networkOpenVpnServerOverride` | `🌐 サーバ上書き（任意）` | `🌐 Server override (optional)` | `🌐 服务器覆盖（可选）` |
| `networkOpenVpnServerOverrideDesc` | `ドメイン名で接続先を上書きします。例: myqnap.myqnapcloud.com または myqnap.example.com:1194。空欄 = .ovpn の設定を使用` | `Overrides the connection target with a domain. e.g. myqnap.myqnapcloud.com or myqnap.example.com:1194. Empty = use .ovpn setting` | `用域名覆盖连接目标。例: myqnap.myqnapcloud.com 或 myqnap.example.com:1194。留空 = 使用 .ovpn 设置` |

---

## 4. テスト戦略

| レイヤー | ケース数 | 主なケース |
|---------|:----:|------|
| ユニット（openvpn.test.ts 追加） | 3 | ① 空欄 → `--remote` なし ② `host` → `--remote host 1194` ③ `host:port` → `--remote host port` |
| 設定テスト（settings.test.ts 追加） | 3 | ① normalize: 不在 → `''` ② validate: port 非数値 → エラー ③ validate: 正常形式 → null |
| UI テスト（SettingTabNetwork.test.ts） | 0 | 既存 3 ケースで網羅（新項目はレンダリング検証に含まれないため追加不要・手動 UAT で確認） |

### UAT チェックリスト

- [ ] ネットワークタブに「🌐 サーバ上書き（任意）」が表示される
- [ ] 空欄のまま接続 → 従来どおり動作（後方互換）
- [ ] DDNS ドメイン入力 → 接続時のログに `--remote` 反映を確認
- [ ] `host:99999` 等の不正 port で設定保存時にエラー表示

---

## 5. CHANGELOG エントリ（案）

```markdown
## [v0.43.2] - 2026-09-xx

### ✨ 新機能

- 🌐 **Server Override**（F-044）: ネットワークタブにサーバ上書き設定を追加
  - ドメイン名（DDNS）で .ovpn の接続先を上書き（`host` または `host:port` 形式）
  - グローバル IP 変動環境で .ovpn の手動修正が不要に
```

---

## 6. オープン項目

| # | 項目 | 対応 |
|:-:|------|------|
| 1 | 接続タイムアウト（「接続中」のまま停止する問題） | 別機能として v0.43.2 での同時実装を推奨（本次接続不調で判明した設計ギャップ） |
| 2 | エラーメッセージ改善（ENOENT 等の生メッセージ） | 同上 |

---

*📐 Server Override 機能 設計仕様書 v1.0 · MiuMiu 🐾 · 2026-09-13*
*🔗 F-044 · 関連: F-041 / F-042 / R10 T11 補遺検証*
