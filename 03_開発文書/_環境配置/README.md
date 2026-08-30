# anime-tts (Damarcreative) — セットアップ README

> 📂 パス：`80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/_環境配置/README.md`
> 関連：[`setup-anime-tts.bat`](./setup-anime-tts.bat)（自動セットアップスクリプト）
> 関連：[`anime-ttsセットアップ手順.md`](./anime-ttsセットアップ手順.md)（手動手順・詳細）

---

## 概要

Claudian Bridge の TTS 機能で `anime-tts (Damarcreative)` エンジンを使うためのローカル環境を構築する手順書です。プラグイン本体は Python 環境・モデル・依存パッケージを同梱しないため、ユーザーが手動で用意する必要があります。

| 項目 | 内容 |
|------|------|
| 上流 | [Damarcreative/anime-tts](https://github.com/Damarcreative/anime-tts)（VITS 派生） |
| 動作 OS | Windows 10 / 11（macOS / Linux は本手順未検証） |
| 必要 Python | **3.10**（`py` Launcher 経由） |
| 必要容量 | 依存 2〜3 GB ＋ モデル 数百 MB × 38 |
| 推定所要時間 | 15〜30 分（回線速度依存） |

---

## クイックスタート（推奨）

### 必要なもの（事前にインストール）

1. **git** — https://git-scm.com/download/win（"Use Git from the Windows command prompt" を選ぶ）
2. **Python 3.10** — https://www.python.org/downloads/windows/
   - 「Add Python to PATH」にチェック、または Microsoft Store 版でインストール
3. **Visual Studio Build Tools**（任意・通常は不要）— https://visualstudio.microsoft.com/downloads/
   - Damarcreative fork は numba JIT のため不要
   - original VITS 構成（`setup.py` あり）を使う場合のみ Phase 6 で必要

### 自動セットアップ（BAT 実行）

コマンドプロンプトまたはエクスプローラのアドレスバーに `cmd` を打ち、setup-anime-tts.bat を実行します。

```cmd
REM 既定（%USERPROFILE%\anime-tts にインストール）
setup-anime-tts.bat

REM 任意の場所を指定
setup-anime-tts.bat D:\tools\anime-tts

REM Python 3.10 が無い場合（上級者向け・pip install 失敗の可能性あり）
setup-anime-tts.bat --force-py=3.11 D:\tools\anime-tts
setup-anime-tts.bat --force-py=any     REM インストール済みの最新を自動選択
```

BAT は以下の 6 フェーズを順次実行します：

| Phase | 内容 | 失敗時の対処 |
| :---: |------|------|
| 1 | 前提チェック（git / Python / MSVC）+ 利用可能 Python の列挙 | インストール or `--force-py` で続行 |
| 2 | `git clone` でリポジトリ取得 | ネットワーク確認 |
| 3 | `py -X.Y -m venv .venv` で仮想環境作成 | Python を確認 |
| 4 | `pip install -r requirements.txt`（PyTorch 1.13.1 等） | 回線・Python 互換性確認 |
| 5 | 既定モデル `ameth.pth` を HF から取得 | 回線確認 |
| 6 | `monotonic_align` をセットアップ（Damarcreative fork は numba JIT のためビルド不要・自動判定） | original VITS 構成（`setup.py` あり）のみ MSVC が必要 |

途中で失敗しても再実行可能（既に完了している Phase はスキップ）。

#### Python バージョン自動検出（Phase 1）

`py -0` の出力をそのまま表示し、続けて実際に応答するバージョン（`py -X.Y --version` で確認）を列挙します：

```
[INFO] Available Python versions via 'py' launcher:
 -V:3.14 *        Python 3.14 (64-bit)
 -V:3.10          Python 3.10 (64-bit)

    - Python 3.14
    - Python 3.10
```

- 3.10 があれば自動採用
- 3.10 が無く `--force-py` フラグも無い場合は、利用可能バージョンと次のコマンド例を案内して停止：
  ```
  setup-anime-tts.bat --force-py=any D:\tools\anime-tts
  ```
- `--force-py=X.Y` または `--force-py=any` が指定されていれば、警告を出した上で続行

> ⚠️ `--force-py` で 3.10 以外を使う場合、Phase 4 で `torch==1.13.1` ピンが自動緩和され最新の torch がインストールされます。Python 3.14 で実動作（CPU 推論）を確認済み（2026-08-13）。3.10 が最も検証済みの構成です。

### 完了後（Claudian Bridge への登録）

1. Obsidian を再起動（起動中の場合）
2. 設定 → Community Plugins → Claudian Bridge → **Text to Speech** タブ
3. Engine: **「anime-tts (Damarcreative)」** を選択
4. **animeTtsDir**: BAT が出力したパスを貼り付け
   ```
   既定: C:\Users\<ユーザー名>\anime-tts
   指定時: <指定したパス>
   ```
5. 任意のノートで右クリック → 「Add to TTS」で動作確認

---

## 手動セットアップ（BAT を使わない場合）

参考用。BAT と同じ結果を手作業で行う場合の手順です。

```bash
# 1. clone（任意の親ディレクトリで）
git clone https://github.com/Damarcreative/anime-tts.git
cd anime-tts

# 2. Python 3.10 仮想環境（torch 1.13.1 / librosa 0.9.1 互換性のため）
py -3.10 -m venv .venv
.venv\Scripts\activate

# 3. 依存パッケージ（2〜3GB）
python -m pip install --upgrade pip
pip install -r requirements.txt

# 4. モデル（HuggingFace から 38 個）
#    全量ダウンロード（時間がかかる）
python download-model.py
#    もしくは既定モデル 1 個のみ
#    https://huggingface.co/tensor-diffusion/anime-tts/resolve/main/anime-tts-model/ameth.pth
#    を model/ 配下に手動配置

# 5. monotonic_align は不要（この fork は numba JIT 実装のため）
#    original VITS 構成（setup.py あり）の場合のみ以下でビルド:
#    cd monotonic_align && python setup.py build_ext --inplace && cd ..
```

---

## トラブルシューティング

### `py -3.10: command not found`

- Python 3.10 がインストールされていません。
- https://www.python.org/downloads/windows/ から 3.10 系をインストール（PATH を通すか、Microsoft Store 版を使う）
- 既に別バージョンが PATH にある場合は `py -0` で利用可能バージョンを確認
- **3.10 を入れたくない場合**: `--force-py=any` または `--force-py=X.Y` で続行可能。Phase 4 で torch ピンが自動緩和されるため、Python 3.14 でも動作実績あり

### `pip install` が極端に遅い／失敗する

- プロキシ／ファイアウォールで HuggingFace や PyPI がブロックされている可能性
- 環境変数 `PIP_INDEX_URL` で社内ミラーを使う、または VPN を確認

### `monotonic_align` ビルド失敗（`error: Microsoft Visual C++ 14.0 or greater is required`）

- **Damarcreative fork は numba JIT のため通常は不要**です（BAT が自動判定してスキップ）
- このエラーが出るのは original VITS 構成（`monotonic_align/setup.py` あり）を使った場合のみ
- 対処: https://visualstudio.microsoft.com/downloads/ から「Build Tools for Visual Studio」をインストール
- 「Desktop development with C++」ワークロードを選択 → 再度 BAT を実行（Phase 6 から再試行）

### Obsidian 側で「Python が見つかりません」と表示される

- Obsidian 起動時に PATH が引き継がれない場合があります
- 一度 Obsidian を完全に終了（タスクトレイの常駐プロセスも）→ 再度セットアップ

### 「モデルが見つかりません」と表示される

- `model\ameth.pth` が存在することを確認
- なければ BAT を再実行、または Phase 5 のコマンドで再ダウンロード

### 「anime-tts は日本語のみ対応」と表示される

- 仕様です。pyopenjtalk が日本語専用音素化のため、中国語・英語は再生できません
- edge-TTS か WebSpeech を選択してください

---

## 制限事項

| 項目 | 内容 |
|------|------|
| 言語 | **日本語のみ**（pyopenjtalk 音素化） |
| 容量 | 依存 2〜3GB + モデル（1 個数百 MB × 38） |
| Python | **3.10 推奨**（torch 1.13.1 互換）。3.11〜3.14 は torch ピン自動緩和で動作実績あり（3.14 検証済み） |
| OS | Windows 検証済み（macOS / Linux は別途手順が必要） |
| 速度 | 推論に GPU があれば高速、CPU only では数十秒かかる場合あり |

---

## プラグイン側で必要になる設定

| 設定項目 | 値 |
|---------|----|
| `tts.engine` | `damarcreative` |
| `tts.animeTtsDir` | 本 BAT で指定したパス（例: `C:\Users\superlambkin\anime-tts`） |

これらは Obsidian → 設定 → Claudian Bridge → Text to Speech タブで指定します。

---

## 関連リンク

- 🎙️ [[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/_superpowers原本/2026-08-13-tts-anime-tts-addition-design]] — 設計書
- 📋 `2026-08-13-tts-anime-tts-addition` — 実装計画（`議事録/docs` 削除に伴いリンク解除）
- 🌐 https://github.com/Damarcreative/anime-tts — 上流リポジトリ
- 🤗 https://huggingface.co/tensor-diffusion/anime-tts — モデル配布元

---

## 更新履歴

| バージョン | 日付 | 修正内容 | 修正者 |
|:----:|------|---------|--------|
| v1.0.0 | 2026-08-13 | 初版（BAT スクリプトと手動手順を併記） | MiuMiu 🐾 |
| v1.1.0 | 2026-08-13 | BAT柔軟化: `py -0` 自動列挙・Python不在時の対話・`--force-py=X.Y` / `--force-py=any` フラグ追加 | MiuMiu 🐾 |
| v1.2.0 | 2026-08-13 | BATバグ修正: `py -0` 解析エラー（`. was unexpected`）を probe 方式に変更、`--force-py=` の findstr 誤判定を substring 比較に変更 | MiuMiu 🐾 |
| v1.3.0 | 2026-08-13 | BATバグ修正: ブロック内 echo 文の括弧 `)` が cmd のブロック解析を壊す問題を修正（5 箇所）。全 Phase を構文エラーなしで完走確認 | MiuMiu 🐾 |
| v1.4.0 | 2026-08-13 | BATバグ修正: Phase4 `echo torch` 追記時の改行欠落（`tqdmtorch`）修正 / Phase5 モデル保存パスの `\a` エスケープ誤解釈をフォワードスラッシュ化で修正 / Phase6 は Damarcreative fork（numba JIT）を自動判定して Cython ビルド不要に。Python 3.14 + torch 2.13 で CPU 推論スモークテスト成功 | MiuMiu 🐾 |