# ClaudianBridge ドキュメント集約 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `D:\AI-Agent\ClaudianBridge`（ソース）の技術ドキュメントを `POC_017_ClaudianBridge`（Vault）にジャンクション経由で集約し、二重管理を解消する。**メインのバージョンは v0.32.9 に統一**（v0.33 系は除外）。

**Architecture:** ソース側のドキュメント 15 項目を削除し、Windows ジャンクション（`mklink /J`）で Vault 側のファイル・ディレクトリを参照する構成に移行。Vault 側が SSOT（Single Source of Truth）。`docs/superpowers/` はソース側の `.gitignore` に追加して Git 管理外とする。**ソース側の v0.33 系コード（`src/`, `tests/`）はそのまま開発継続**、Vault 側のドキュメントのみ v0.31.0〜v0.32.9 で統一。

**Tech Stack:** Windows ジャンクション（mklink）、Git、bash、Node.js + TypeScript（既存）、Vitest（既存）、npm scripts（既存）

## Global Constraints

- **OS**: Windows 環境のみ（ジャンクション非対応環境では本計画は動作しない）
- **SSOT**: `POC_017_ClaudianBridge` 側を真実とする。ソース側でドキュメントを編集しない
- **メインヴァージョン**: **v0.32.9** に統一。CHANGELOG / ドキュメント取込は **v0.31.0〜v0.32.9** のみ（**v0.33 系は除外**）
- **ソースコード**: ソース側の v0.33 系コード（`src/`, `tests/`）はそのまま開発継続（対象外）
- **ジャンクション作成前のコミット**: 全未コミットファイルを事前にコミット
- **バックアップ**: ジャンクション化前に `.bak/2026-09-03-pre-junction/` に原本保存
- **検証**: 各タスク完了時に期待出力を確認
- **ロールバック**: F8（ビルド/テスト失敗）時のみ、`.bak/` から復元

---

## タスク全体像

| # | タスク | 推定工数 |
|---|--------|---------|
| 1 | Vault 側の未コミット変更をコミット | 5 分 |
| 2 | ソース側の未コミット変更をコミット | 3 分 |
| 3 | CHANGELOG 同期（ソース → Vault） | 10 分 |
| 4 | README 同期（ソース → Vault） | 3 分 |
| 5 | ドキュメント取込（ソース → Vault） | 15 分 |
| 6 | `docs/` を `.gitignore` に追加 | 5 分 |
| 7 | 差分検証（事前） | 3 分 |
| 8 | バックアップ作成 | 3 分 |
| 9 | ジャンクション作成スクリプト作成 | 5 分 |
| 10 | ジャンクション作成 | 5 分 |
| 11 | ジャンクション健全性検証 | 5 分 |
| 12 | ビルド検証 | 5 分 |
| 13 | テスト検証 | 5 分 |
| 14 | 完了レポート | 5 分 |

---

## Task 1: Vault 側の未コミット変更をコミット

**Files:**
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/01_移行ガイド.md` (M)
- Create: `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-09-01-token-rate-display-select-design.md` (??)
- Create: `80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/2026-09-01-token-rate-interval-setting-design.md` (??)
- Create: `80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/2026-08-30-token-rate-display-plan.md` (??)
- Create: `80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/21_トークン速度表示機能実装計画.md` (??)
- Create: `80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/22_トークン速度更新周期設定実装計画.md` (??)
- Create: `80_POC_Projects/POC_017_ClaudianBridge/08_説明書/04_トークン速度の更新手順_中学生向け解説.md` (??)

**Interfaces:**
- Consumes: なし
- Produces: Vault 側 Git 状態が clean

- [ ] **Step 1: 現状確認**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && git status --porcelain
```

Expected: 7 ファイル以上の未コミット変更（1 modified + 6 untracked）。

- [ ] **Step 2: 変更内容を確認**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && git status --short
```

Expected: 以下のリスト:
```
 M "01_\347\247\273\350\241\214\343\202\254\343\202\244\343\203\211.md"
?? "02_\350\250\255\350\250\210\346\226\207\346\233\270/2026-09-01-token-rate-display-select-design.md"
?? "02_\350\250\255\350\250\210\346\226\207\346\233\270/2026-09-01-token-rate-interval-setting-design.md"
?? "03_\351\226\213\347\231\272\346\226\207\346\233\270/2026-08-30-token-rate-display-plan.md"
?? "03_\351\226\213\347\231\272\346\226\207\346\233\270/21_\343\203\210\343\203\274\343\202\257\343\203\263\351\200\237\345\272\246\350\241\250\347\244\272\351\240\205\347\233\256\351\201\270\346\212\236\345\256\237\350\243\205\350\250\210\347\224\273.md"
?? "03_\351\226\213\347\231\272\346\226\207\346\233\270/22_\343\203\210\343\203\274\343\202\257\343\203\263\351\200\237\345\272\246\346\233\264\346\226\260\345\221\250\346\234\237\350\250\255\345\256\237\350\243\205\350\250\210\347\224\273.md"
?? "08_\350\252\254\346\230\216\346\226\207\346\233\270/04_\343\203\210\343\203\274\343\202\257\343\203\263\351\200\237\345\272\246\343\201\256\346\233\264\346\226\260\346\211\213\346\263\225_\344\270\255\345\255\246\347\224\237\345\220\221\343\201\91\350\247\243\350\252\254.md"
```

- [ ] **Step 3: 全ファイルをステージング**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && git add -A
```

Expected: 何も表示されない（正常終了）。

- [ ] **Step 4: コミット**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && git commit -m "docs(POC_017): v0.30.2 関連未コミットファイルを取り込み

- 01_移行ガイド.md: v0.30.2 反映
- 02_設計文書: トークン速度表示セレクト・更新周期設定の仕様書 2 件
- 03_開発文書: トークン速度表示の実装計画 3 件
- 08_説明書: トークン速度の更新手順（中学生向け解説）1 件"
```

Expected: 1 commit created, 7 files changed。

- [ ] **Step 5: コミット後の確認**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && git status --porcelain | wc -l
```

Expected: `0`（clean）。

---

## Task 2: ソース側の未コミット変更をコミット

**Files:**
- Modify: `D:\AI-Agent\ClaudianBridge\tests\features\tts\core.test.ts` (M)

**Interfaces:**
- Consumes: なし
- Produces: ソース側 Git 状態が clean

- [ ] **Step 1: 現状確認**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git status --short
```

Expected: `M tests/features/tts/core.test.ts`（1 件 modified）。

- [ ] **Step 2: 変更内容を確認**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git diff --stat tests/features/tts/core.test.ts
```

Expected: 変更行数が表示される（具体的な数値は状況依存）。

- [ ] **Step 3: ステージングとコミット**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add tests/features/tts/core.test.ts && git commit -m "test(POC_017): TTS core.test.ts 未コミット変更を取り込み"
```

Expected: 1 commit created, 1 file changed。

- [ ] **Step 4: コミット後の確認**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git status --porcelain | wc -l
```

Expected: `0`（clean）。

---

## Task 3: CHANGELOG 同期（ソース → Vault、v0.31.0〜v0.32.9）

**Files:**
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/CHANGELOG.md`

**Interfaces:**
- Consumes: ソース側 `D:\AI-Agent\ClaudianBridge\CHANGELOG.md` の **v0.31.0〜v0.32.9** エントリ（**v0.33 系は除外**）
- Produces: Vault 側 CHANGELOG.md に v0.31.0〜v0.32.9 追記

> ⚠️ **スコープ厳守**: v0.33.0 以降のエントリは **絶対に追加しない**。メインは v0.32.9。

- [ ] **Step 1: ソース側の v0.31〜v0.32 コミット ID を抽出（v0.33 除外）**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git log --oneline --grep="v0\.3[1-2]\." | head -30
```

Expected: v0.31.0〜v0.32.9 関連のコミット一覧。**v0.33.x は含まれない**。

- [ ] **Step 2: ソース側 CHANGELOG の v0.31〜v0.32 行番号を抽出**

```bash
cd "D:/AI-Agent/ClaudianBridge" && grep -n "^## v0\.3[1-2]" CHANGELOG.md | head -20
```

Expected: v0.31.0, v0.32.0, v0.32.1, ..., v0.32.9 などの行番号リスト（**v0.33.x は含まれない**）。

- [ ] **Step 3: v0.33 系の境界を確認**

```bash
cd "D:/AI-Agent/ClaudianBridge" && grep -n "^## v0\.33" CHANGELOG.md | head -3
```

Expected: `## v0.33.0` の行番号（境界線）。この行以降のエントリは除外する。

- [ ] **Step 4: ソース CHANGELOG の v0.31.0〜v0.32.9 セクションを抽出**

```bash
cd "D:/AI-Agent/ClaudianBridge" && awk '/^## v0\.31\.0/{flag=1} /^## v0\.33\.0/{flag=0} flag' CHANGELOG.md > /tmp/source_changelog_v31_32.txt
```

Expected: /tmp/source_changelog_v31_32.txt に v0.31.0〜v0.32.9 のエントリのみが出力される（**v0.33.0 以降は含まれない**）。

- [ ] **Step 5: 抽出内容を確認**

```bash
head -30 /tmp/source_changelog_v31_32.txt && echo "..." && tail -20 /tmp/source_changelog_v31_32.txt && echo "..." && wc -l /tmp/source_changelog_v31_32.txt
```

Expected: 冒頭が `## v0.31.0`、末尾が `## v0.32.9` で終わるテキスト。`## v0.33.0` が含まれていないことを確認。

- [ ] **Step 6: v0.33 系の非含有を再確認**

```bash
grep -c "^## v0\.33" /tmp/source_changelog_v31_32.txt
```

Expected: `0`（v0.33 系は含まれていない）。

- [ ] **Step 7: Vault CHANGELOG の `## v0.30.2` 行を特定**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && grep -n "^## v0\.30\.2" CHANGELOG.md | head -1
```

Expected: v0.30.2 セクションの行番号（例: `42:## v0.30.2`）。

- [ ] **Step 8: 挿入位置の確認**

Read ツールで CHANGELOG.md の該当行周辺を確認し、挿入ポイントを決定する。

- [ ] **Step 9: 挿入**

`Edit` ツールで `## v0.30.2` の直前にソース v0.31.0〜v0.32.9 のセクションを挿入する。

- [ ] **Step 10: 挿入結果の検証（v0.33 系が混入していないこと）**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && grep -c "^## v0\.33" CHANGELOG.md
```

Expected: `0`（v0.33 系は Vault CHANGELOG にまだ含まれていない）。

- [ ] **Step 11: 差分検証**

```bash
diff "D:/AI-Agent/ClaudianBridge/CHANGELOG.md" "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/CHANGELOG.md" | head -30
```

Expected: v0.31〜v0.32 の差分は少ない（マージ漏れ検知）。v0.33 以降の差分は多数（v0.33 は除外したため差分が出る、これは正常）。

- [ ] **Step 12: コミット**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && git add CHANGELOG.md && git commit -m "docs(POC_017): CHANGELOG に v0.31.0〜v0.32.9 をマージ（メイン v0.32.9 統一、v0.33 系は除外）"
```

Expected: 1 commit created, 1 file changed。

---

## Task 4: README 同期（ソース → Vault）

**Files:**
- Modify: `80_POC_Projects/POC_017_ClaudianBridge/README.md`

**Interfaces:**
- Consumes: ソース側 `D:\AI-Agent\ClaudianBridge\README.md`
- Produces: Vault 側 README.md をソース側に同期

- [ ] **Step 1: 差分確認**

```bash
diff -q "D:/AI-Agent/ClaudianBridge/README.md" "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/README.md"
```

Expected: `Files ... differ`（差分あり）。

- [ ] **Step 2: 差分の詳細**

```bash
diff "D:/AI-Agent/ClaudianBridge/README.md" "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/README.md" | head -50
```

Expected: 差分行が表示される。最新版はソース側（Sep 3）と仮定。

- [ ] **Step 3: ソース → Vault コピー**

```bash
cp "D:/AI-Agent/ClaudianBridge/README.md" "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/README.md"
```

Expected: 何も表示されない（正常終了）。

- [ ] **Step 4: コピー後の差分ゼロ確認**

```bash
diff -q "D:/AI-Agent/ClaudianBridge/README.md" "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/README.md"
```

Expected: 何も表示されない（差分なし）。

- [ ] **Step 5: コミット**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && git add README.md && git commit -m "docs(POC_017): README.md をソース側に同期"
```

Expected: 1 commit created, 1 file changed（変更があった場合）。

---

## Task 5: ドキュメント取込（ソース → Vault、v0.31.0〜v0.32.9）

**Files:**
- Read: `D:\AI-Agent\ClaudianBridge\02_設計文書\`、`03_開発文書\`、`08_説明書\` のうち v0.31.0〜v0.32.9 関連
- Create: Vault 側に対応するファイル（取込が必要な場合）

**Interfaces:**
- Consumes: ソース側の **v0.31.0〜v0.32.9** 関連の設計書・計画書・説明書（**v0.33 系は除外**）
- Produces: Vault 側に対応するファイル（または取込不要の確認）

> ⚠️ **スコープ厳守**: v0.33 系のドキュメントは **絶対に Vault に取り込まない**。

- [ ] **Step 1: ソース側の v0.31〜v0.32 ドキュメントコミットを抽出**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git log --oneline --grep="v0\.3[1-2]\." -- "02_設計文書/" "03_開発文書/" "08_説明書/" | head -30
```

Expected: v0.31.0〜v0.32.9 関連のドキュメントコミット一覧（**v0.33 系は含まれない**）。

- [ ] **Step 2: 該当ファイルのリストアップ**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git log --name-only --grep="v0\.3[1-2]\." -- "02_設計文書/" "03_開発文書/" "08_説明書/" --pretty=format: | sort -u | head -30
```

Expected: v0.31.0〜v0.32.9 で追加・変更されたファイル名一覧。

- [ ] **Step 3: 各ファイルが Vault 側に存在するか確認**

```bash
for f in $(cd "D:/AI-Agent/ClaudianBridge" && git log --name-only --grep="v0\.3[1-2]\." -- "02_設計文書/" "03_開発文書/" "08_説明書/" --pretty=format: | sort -u); do
    if [ -f "D:/AI-Agent/ClaudianBridge/$f" ]; then
        vault_path="C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/$f"
        if [ ! -f "$vault_path" ]; then
            echo "MISSING in Vault: $f"
        else
            echo "EXISTS: $f"
        fi
    fi
done
```

Expected: 存在しないファイルのリスト（MISSING in Vault: ...）。0 件の場合は取込不要。

- [ ] **Step 4: 不足ファイルを Vault 側にコピー**

```bash
# MISSING in Vault のリストに基づいてコピー
mkdir -p "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/02_設計文書"
cp "D:/AI-Agent/ClaudianBridge/02_設計文書/<missing_file>.md" "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/"
# （同様のコマンドを必要なファイル数だけ繰り返す）
```

Expected: コピーが成功。v0.33 系のファイル名は除外されていること。

- [ ] **Step 5: コピー後の確認**

```bash
ls "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/" | wc -l
```

Expected: コピー後のファイル数が想定通り。

- [ ] **Step 6: v0.33 系ファイルが混入していないこと再確認**

```bash
# Vault 側の 02_設計文書 に v0.33 関連のファイルが混入していないか確認
ls "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/" | grep -i "v0\.33" || echo "OK: v0.33 系なし"
```

Expected: `OK: v0.33 系なし`（v0.33 関連のファイルが混入していない）。

- [ ] **Step 7: コミット**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && git add -A && git commit -m "docs(POC_017): ソース側 v0.31.0〜v0.32.9 関連ドキュメントを取込（v0.33 系は除外）"
```

Expected: 1 commit created（取込があった場合）。

---

## Task 6: `docs/` を `.gitignore` に追加

**Files:**
- Modify: `D:\AI-Agent\ClaudianBridge\.gitignore`

**Interfaces:**
- Consumes: ソース側 `.gitignore`
- Produces: `docs/` が Git 管理外に

- [ ] **Step 1: 現状の `.gitignore` を確認**

```bash
cat "D:/AI-Agent/ClaudianBridge/.gitignore"
```

Expected: 既存の内容が表示される。

- [ ] **Step 2: `docs/` が既に含まれているか確認**

```bash
grep -E "^docs/?$" "D:/AI-Agent/ClaudianBridge/.gitignore"
```

Expected: 既にあればその行が、なければ何も表示されない。

- [ ] **Step 3: 含まれていなければ追加**

含まれていない場合のみ:

```bash
echo "" >> "D:/AI-Agent/ClaudianBridge/.gitignore"
echo "# Local superpowers specs/plans (not for source code repo)" >> "D:/AI-Agent/ClaudianBridge/.gitignore"
echo "docs/" >> "D:/AI-Agent/ClaudianBridge/.gitignore"
```

Expected: 何も表示されない（正常終了）。

- [ ] **Step 4: 既存追跡ファイルの確認**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git ls-files docs/ | head -10
```

Expected: 追跡済みファイルの一覧（ある場合）または何も表示されない。

- [ ] **Step 5: 既存追跡ファイルを `git rm --cached` で解除**

追跡済みファイルがある場合のみ:

```bash
cd "D:/AI-Agent/ClaudianBridge" && git rm --cached -r docs/
```

Expected: `rm 'docs/...'` のようなメッセージが複数。

- [ ] **Step 6: `.gitignore` の変更をコミット**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add .gitignore && git status --short
```

Expected: `.gitignore` の modified が表示される。

```bash
cd "D:/AI-Agent/ClaudianBridge" && git commit -m "chore(POC_017): .gitignore に docs/ を追加（Vault 側参照）"
```

Expected: 1 commit created。

- [ ] **Step 7: コミット後の確認**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git status --porcelain | wc -l
```

Expected: `0`（clean）。

---

## Task 7: 差分検証（ジャンクション化前）

**Files:**
- なし（読み取り専用検証）

**Interfaces:**
- Consumes: 両側のドキュメント 15 項目
- Produces: 差分レポート（`.bak/diff-report-2026-09-03-pre.txt`）

- [ ] **Step 1: 差分ディレクトリの準備**

```bash
mkdir -p "D:/AI-Agent/ClaudianBridge/.bak"
```

Expected: 何も表示されない（正常終了）。

- [ ] **Step 2: 両側の差分レポート生成**

```bash
diff -rq \
    "D:/AI-Agent/ClaudianBridge/00_プロジェクト立項.md" \
    "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/00_プロジェクト立項.md" \
    > "D:/AI-Agent/ClaudianBridge/.bak/diff-report-2026-09-03-pre.txt" 2>&1

# 残りの 14 項目も同様に追加
for item in "00_使用ガイド.md" "01_移行ガイド.md" "01_要件定義" "02_設計文書" "03_開発文書" "04_テスト文書" "05_デプロイ運用" "06_振り返り" "08_説明書" "09_対話まとめ" "CHANGELOG.md" "README.md" "THIRD_PARTY_NOTICES.md" "MyPOC開発"; do
    diff -rq \
        "D:/AI-Agent/ClaudianBridge/$item" \
        "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/$item" \
        >> "D:/AI-Agent/ClaudianBridge/.bak/diff-report-2026-09-03-pre.txt" 2>&1
done
```

Expected: 何も表示されない（または差分行が diff-report に記録される）。

- [ ] **Step 3: 差分レポートの確認**

```bash
cat "D:/AI-Agent/ClaudianBridge/.bak/diff-report-2026-09-03-pre.txt"
```

Expected: 差分があれば `Files ... differ` の行が、なければ何も表示されない。

- [ ] **Step 4: 差分許容範囲の判定**

```bash
wc -l "D:/AI-Agent/ClaudianBridge/.bak/diff-report-2026-09-03-pre.txt"
```

Expected: 行数を確認。差分がある場合は Task 5 に戻る。差分ゼロなら Task 8 へ進む。

> ⚠️ **判定**: 差分がある場合はジャンクション化せず、Task 5 で再度取り込み。

---

## Task 8: バックアップ作成

**Files:**
- Create: `D:\AI-Agent\ClaudianBridge\.bak\2026-09-03-pre-junction\` 配下の原本

**Interfaces:**
- Consumes: ソース側のドキュメント 15 項目
- Produces: `.bak/2026-09-03-pre-junction/` 配下に原本

- [ ] **Step 1: バックアップディレクトリ作成**

```bash
mkdir -p "D:/AI-Agent/ClaudianBridge/.bak/2026-09-03-pre-junction"
```

Expected: 何も表示されない（正常終了）。

- [ ] **Step 2: ファイル単体のバックアップ**

```bash
cd "D:/AI-Agent/ClaudianBridge" && cp 00_プロジェクト立項.md 00_使用ガイド.md 01_移行ガイド.md CHANGELOG.md README.md THIRD_PARTY_NOTICES.md .bak/2026-09-03-pre-junction/
```

Expected: 何も表示されない（正常終了）。

- [ ] **Step 3: ディレクトリ単位のバックアップ**

```bash
cd "D:/AI-Agent/ClaudianBridge" && cp -r 01_要件定義 02_設計文書 03_開発文書 04_テスト文書 05_デプロイ運用 06_振り返り 08_説明書 09_対話まとめ MyPOC開発 .bak/2026-09-03-pre-junction/
```

Expected: 何も表示されない（正常終了）。

- [ ] **Step 4: バックアップの整合確認**

```bash
find "D:/AI-Agent/ClaudianBridge/.bak/2026-09-03-pre-junction" -type f | wc -l
```

Expected: バックアップファイル数（推定 50〜150 ファイル、ディレクトリ内のサブファイル含む）。

- [ ] **Step 5: バックアップ内主要ファイルの確認**

```bash
ls "D:/AI-Agent/ClaudianBridge/.bak/2026-09-03-pre-junction/"
```

Expected: 15 項目（6 ファイル + 9 ディレクトリ）。

---

## Task 9: ジャンクション作成スクリプト作成

**Files:**
- Create: `D:\AI-Agent\ClaudianBridge\_create_junctions.ps1`

**Interfaces:**
- Consumes: バックアップ済みのソース側ドキュメント
- Produces: PowerShell スクリプト

- [ ] **Step 1: スクリプトファイル作成**

Write ツールで `D:\AI-Agent\ClaudianBridge\_create_junctions.ps1` に以下を保存:

```powershell
# _create_junctions.ps1
# ClaudianBridge ドキュメントジャンクション作成スクリプト

$ErrorActionPreference = "Stop"
$vault = "C:\Users\superlambkin\OneDrive\Edge\Obsidian Vault\80_POC_Projects\POC_017_ClaudianBridge"

# ジャンクション対象 (15 項目)
$items = @(
    "00_プロジェクト立項.md",
    "00_使用ガイド.md",
    "01_移行ガイド.md",
    "01_要件定義",
    "02_設計文書",
    "03_開発文書",
    "04_テスト文書",
    "05_デプロイ運用",
    "06_振り返り",
    "08_説明書",
    "09_対話まとめ",
    "CHANGELOG.md",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
    "MyPOC開発"
)

foreach ($item in $items) {
    $src = Join-Path $PSScriptRoot $item
    $dst = Join-Path $vault $item

    if (-not (Test-Path $dst)) {
        Write-Host "[ERROR] リンク先が存在しません: $dst" -ForegroundColor Red
        exit 1
    }

    # 既存ファイル/ジャンクションを削除
    if (Test-Path $src) {
        if ((Get-Item $src).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            cmd /c rmdir $src | Out-Null
        } else {
            Remove-Item $src -Force -Recurse
        }
    }

    # ジャンクション作成
    try {
        New-Item -ItemType Junction -Path $src -Target $dst | Out-Null
        Write-Host "[OK] $src -> $dst" -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] ジャンクション作成失敗: $src" -ForegroundColor Red
        Write-Host $_.Exception.Message
        exit 1
    }
}

Write-Host "`n全ジャンクション作成完了" -ForegroundColor Cyan
```

- [ ] **Step 2: スクリプトの構文チェック**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { \$null = [scriptblock]::Create((Get-Content 'D:/AI-Agent/ClaudianBridge/_create_junctions.ps1' -Raw)); Write-Host 'SYNTAX OK' }"
```

Expected: `SYNTAX OK`

---

## Task 10: ジャンクション作成

**Files:**
- Modify: `D:\AI-Agent\ClaudianBridge\` 配下の 15 項目

**Interfaces:**
- Consumes: Task 9 のスクリプト
- Produces: 15 ジャンクション

- [ ] **Step 1: スクリプト実行**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File "D:/AI-Agent/ClaudianBridge/_create_junctions.ps1"
```

Expected: `[OK] ...` が 15 行表示され、最後に `全ジャンクション作成完了`。

- [ ] **Step 2: ジャンクション一覧の確認**

```bash
cmd //c dir /AL "D:/AI-Agent/ClaudianBridge/" | head -30
```

Expected: 15 件のジャンクション（JUNCTION 列）が表示される。

---

## Task 11: ジャンクション健全性検証

**Files:**
- なし（読み取り専用検証）

**Interfaces:**
- Consumes: 15 ジャンクション
- Produces: L1, L2 テスト結果

- [ ] **Step 1: L1 ジャンクション健全性テスト（個別確認）**

```bash
cmd //c dir /AL "D:/AI-Agent/ClaudianBridge/CHANGELOG.md" 2>&1 | grep -i junction
```

Expected: `JUNCTION` の表示とリンク先パス。

- [ ] **Step 2: L1 全ジャンクションの一括確認**

```bash
powershell -NoProfile -Command "
\$items = @('00_プロジェクト立項.md', '00_使用ガイド.md', '01_移行ガイド.md', '01_要件定義', '02_設計文書', '03_開発文書', '04_テスト文書', '05_デプロイ運用', '06_振り返り', '08_説明書', '09_対話まとめ', 'CHANGELOG.md', 'README.md', 'THIRD_PARTY_NOTICES.md', 'MyPOC開発')
\$broken = 0
foreach (\$item in \$items) {
    \$src = Join-Path 'D:\AI-Agent\ClaudianBridge' \$item
    if (-not (Test-Path \$src)) {
        Write-Host \"[NG] \$item - リンク切れ\"
        \$broken++
    } else {
        Write-Host \"[OK] \$item\"
    }
}
if (\$broken -gt 0) { exit 1 } else { Write-Host 'L1 PASS' }
"
```

Expected: 15 行の `[OK] ...` と `L1 PASS`。

- [ ] **Step 3: L2 ファイル内容同一性テスト**

```bash
diff -rq \
    "D:/AI-Agent/ClaudianBridge/00_プロジェクト立項.md" \
    "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/00_プロジェクト立項.md"
```

Expected: 何も表示されない（差分なし）。

- [ ] **Step 4: L2 全項目の同一性テスト**

```bash
for item in "00_プロジェクト立項.md" "00_使用ガイド.md" "01_移行ガイド.md" "01_要件定義" "02_設計文書" "03_開発文書" "04_テスト文書" "05_デプロイ運用" "06_振り返り" "08_説明書" "09_対話まとめ" "CHANGELOG.md" "README.md" "THIRD_PARTY_NOTICES.md" "MyPOC開発"; do
    result=$(diff -rq \
        "D:/AI-Agent/ClaudianBridge/$item" \
        "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge/$item" 2>&1)
    if [ -z "$result" ]; then
        echo "[OK] $item"
    else
        echo "[NG] $item"
        echo "$result"
    fi
done
```

Expected: 15 行の `[OK] ...`。

---

## Task 12: ビルド検証

**Files:**
- Modify: `D:\AI-Agent\ClaudianBridge\main.js`（ビルド成果物）

**Interfaces:**
- Consumes: ソース側のソースコード・依存関係
- Produces: `main.js` の再生成

- [ ] **Step 1: 依存関係のインストール**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npm install
```

Expected: `added X packages` のようなメッセージと `0 vulnerabilities`（既存状態と同じ）。

- [ ] **Step 2: ビルド実行**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npm run build
```

Expected: `Build complete` のようなメッセージ（esbuild の出力による）。

- [ ] **Step 3: main.js の確認**

```bash
ls -la "D:/AI-Agent/ClaudianBridge/main.js"
```

Expected: ファイルサイズが 1.5〜2.0 MB 程度。

- [ ] **Step 4: Git 状態確認**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git status --short
```

Expected: main.js が modified の場合あり（タイムスタンプ変更による）、または差分なし。

- [ ] **Step 5: main.js 変更のコミット（必要な場合）**

main.js が modified の場合のみ:

```bash
cd "D:/AI-Agent/ClaudianBridge" && git add main.js && git commit -m "build(POC_017): ジャンクション化後の main.js 再生成"
```

Expected: 1 commit created。

---

## Task 13: テスト検証

**Files:**
- なし（読み取り専用テスト実行）

**Interfaces:**
- Consumes: ソースコード・テストコード
- Produces: 全テスト PASS の確認

- [ ] **Step 1: テスト実行**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npm test
```

Expected: 全テスト PASS（vitest の出力による）。

- [ ] **Step 2: テスト結果の記録**

```bash
cd "D:/AI-Agent/ClaudianBridge" && npm test 2>&1 | tee "D:/AI-Agent/ClaudianBridge/.bak/test-result-2026-09-03.txt"
```

Expected: テスト結果ファイルに `Test Files ... passed` のようなメッセージ。

- [ ] **Step 3: Git 状態確認**

```bash
cd "D:/AI-Agent/ClaudianBridge" && git status --porcelain | wc -l
```

Expected: `0` またはテスト関連の modified のみ。

---

## Task 14: 完了レポート

**Files:**
- Create: `80_POC_Projects/POC_017_ClaudianBridge\09_対話まとめ\2026-09-03_ドキュメント集約完了報告.md`

**Interfaces:**
- Consumes: 完了した全タスクの結果
- Produces: 完了レポート

- [ ] **Step 1: 完了サマリの作成**

Write ツールで完了レポートを作成:

```markdown
# 2026-09-03 ドキュメント集約完了報告（v0.32.9 統一）

## 概要
- ソース側ジャンクション化: 15 項目完了
- Vault 側 CHANGELOG 同期: v0.31.0〜v0.32.9 マージ完了（**メイン v0.32.9 統一、v0.33 系は除外**）
- ソース側 v0.33 系コード（src/, tests/）: そのまま開発継続（対象外）
- ビルド・テスト: 全 PASS

## 変更ファイル

### コミット履歴
- Vault 側: [ここにコミットハッシュを列挙]
- ソース側: [ここにコミットハッシュを列挙]

### ジャンクション一覧
- 00_プロジェクト立項.md → Vault
- 00_使用ガイド.md → Vault
- ... (15 項目)

## 検証結果
- L1 ジャンクション健全性: PASS
- L2 ファイル内容同一性: PASS
- L3 ビルド: PASS
- L4 テスト: PASS (全 X 件)
- L5 Git 状態: 両側 clean
- L6 v0.32.9 統一: PASS（Vault 側 CHANGELOG の最新エントリが v0.32.9、v0.33 系ドキュメントは Vault に取り込まれていない）

## 残存リスク
- なし（バックアップ `.bak/2026-09-03-pre-junction/` を保持）
```

- [ ] **Step 2: 完了レポートのコミット**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && git add "09_対話まとめ/2026-09-03_ドキュメント集約完了報告.md" && git commit -m "docs(POC_017): ドキュメント集約タスク完了報告"
```

Expected: 1 commit created。

- [ ] **Step 3: 最終 Git 状態確認**

```bash
cd "C:/Users/superlambkin/OneDrive/Edge/Obsidian Vault/80_POC_Projects/POC_017_ClaudianBridge" && git status --porcelain | wc -l
cd "D:/AI-Agent/ClaudianBridge" && git status --porcelain | wc -l
```

Expected: 両側とも `0`（clean）。

---

## ロールバック手順（緊急時）

ビルド・テストが失敗し、ソース側の状態に問題がある場合のみ実行:

- [ ] **Step 1: ジャンクションを削除**

```bash
powershell -NoProfile -Command "
\$items = @('00_プロジェクト立項.md', '00_使用ガイド.md', '01_移行ガイド.md', '01_要件定義', '02_設計文書', '03_開発文書', '04_テスト文書', '05_デプロイ運用', '06_振り返り', '08_説明書', '09_対話まとめ', 'CHANGELOG.md', 'README.md', 'THIRD_PARTY_NOTICES.md', 'MyPOC開発')
foreach (\$item in \$items) {
    \$src = Join-Path 'D:\AI-Agent\ClaudianBridge' \$item
    if (Test-Path \$src) {
        if ((Get-Item \$src).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            cmd /c rmdir \$src | Out-Null
            Write-Host \"[OK] ジャンクション削除: \$item\"
        }
    }
}
"
```

- [ ] **Step 2: バックアップから復元**

```bash
cd "D:/AI-Agent/ClaudianBridge" && cp .bak/2026-09-03-pre-junction/00_プロジェクト立項.md . && cp .bak/2026-09-03-pre-junction/00_使用ガイド.md . && cp .bak/2026-09-03-pre-junction/01_移行ガイド.md . && cp .bak/2026-09-03-pre-junction/CHANGELOG.md . && cp .bak/2026-09-03-pre-junction/README.md . && cp .bak/2026-09-03-pre-junction/THIRD_PARTY_NOTICES.md . && cp -r .bak/2026-09-03-pre-junction/01_要件定義 .bak/2026-09-03-pre-junction/02_設計文書 .bak/2026-09-03-pre-junction/03_開発文書 .bak/2026-09-03-pre-junction/04_テスト文書 .bak/2026-09-03-pre-junction/05_デプロイ運用 .bak/2026-09-03-pre-junction/06_振り返り .bak/2026-09-03-pre-junction/08_説明書 .bak/2026-09-03-pre-junction/09_対話まとめ .bak/2026-09-03-pre-junction/MyPOC開発 .
```

- [ ] **Step 3: 状態確認**

```bash
ls "D:/AI-Agent/ClaudianBridge/00_プロジェクト立項.md" "D:/AI-Agent/ClaudianBridge/CHANGELOG.md"
```

Expected: ジャンクションではなく通常ファイルとして存在。

---

*📚 実装計画 v1.0 · MiuMiu 🐾 · 2026-09-03*
