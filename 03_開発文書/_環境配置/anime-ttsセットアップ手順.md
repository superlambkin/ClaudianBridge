# anime-tts (Damarcreative) セットアップ手順

> 📂 路径：80_POC_Projects/POC_017_ClaudianBridge/03_開発文書/_環境配置/anime-ttsセットアップ手順.md
>
> 🚀 **クイックスタート**: [`setup-anime-tts.bat`](./setup-anime-tts.bat) を実行すれば全自動
> 📘 **詳細手順**: [`README.md`](./README.md) を参照

---

## 概要

Claudian Bridge の TTS で anime-tts (Damarcreative) を使うためのローカル環境構築手順です。

## 自動セットアップ（推奨）

```cmd
setup-anime-tts.bat                    REM 既定 (%USERPROFILE%\anime-tts)
setup-anime-tts.bat D:\tools\anime-tts REM 任意パス指定
```

詳細・トラブルシューティングは [[README]] を参照してください。

## 手動手順

```bash
# 1. clone（任意の親ディレクトリで）
git clone https://github.com/Damarcreative/anime-tts.git
cd anime-tts

# 2. Python 3.10 仮想環境（torch 1.13.1 / librosa 0.9.1 互換性のため）
py -3.10 -m venv .venv
.venv\Scripts\activate

# 3. 依存（2〜3GB）
pip install -r requirements.txt

# 4. モデル（HuggingFace から 38 個）
python download-model.py

# 5. monotonic_align は不要（この fork は numba JIT 実装）
#    original VITS 構成の場合のみ: cd monotonic_align && python setup.py build_ext --inplace && cd ..
```

## プラグインへの登録

Claudian Bridge 設定 → テキスト読み上げ → エンジン「anime-tts (Damarcreative)」→ 上の clone 先パスを animeTtsDir に入力。

## 制限

| 項目 | 内容 |
|------|------|
| 言語 | 日本語のみ（pyopenjtalk 音素化） |
| 容量 | 依存 2〜3GB + モデル（1 個数百 MB × 38） |
| Python | 3.10 推奨（torch 1.13.1 互換） |

## 参照

- [[80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/_superpowers原本/2026-08-13-tts-anime-tts-addition-design]]