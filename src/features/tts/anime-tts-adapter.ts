/**
 * anime-tts (Damarcreative) 用 Python アダプタ。
 *
 * 上流 `main.py` は argparse を持たない Colab ノートブック形式のため、
 * プラグインから CLI 引数で呼び出せるよう本アダプタを生成する。
 * 実行時に os.tmpdir() 配下に書き出され、Python から spawn される。
 *
 * 動作:
 *   1. --dir で指定されたディレクトリを sys.path に挿入し chdir
 *   2. 上流の models.py / utils.py / modules.py を import
 *   3. hps 読込 → SynthesizerTrn 構築 → load_checkpoint(<dir>/model/<model>)
 *   4. stdin からテキスト受信 → text_to_sequence → net_g.infer
 *   5. scipy.io.wavfile.write で --out に wav 出力
 */
export const ANIME_TTS_ADAPTER_PY: string = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import os
import sys


def _read_text_from_stdin() -> str:
    return sys.stdin.read()


def _build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Claudian Bridge anime-tts adapter")
    p.add_argument('--dir', required=True, help='path to cloned anime-tts repo')
    p.add_argument('--model', default='ameth.pth', help='model filename under <dir>/model/')
    p.add_argument('--config', default='configs/config-single-speaker.json', help='hps config path (relative to --dir)')
    p.add_argument('--out', required=True, help='output wav path')
    return p


def _load_vits(dir_path: str, config_rel: str, model_file: str):
    sys.path.insert(0, dir_path)
    import utils  # type: ignore
    import commons  # type: ignore
    import models  # type: ignore
    from torch import no_grad

    hps = utils.get_hparams_from_file(os.path.join(dir_path, config_rel))
    net_g = models.SynthesizerTrn(
        len(hps.symbols),
        hps.data.filter_length // 2 + 1,
        hps.train.segment_size // hps.data.hop_length,
        n_speakers=hps.data.n_speakers if hasattr(hps.data, 'n_speakers') else 0,
        **hps.model,
    ).cuda()
    _ = utils.load_checkpoint(os.path.join(dir_path, 'model', model_file), net_g, None)
    net_g.eval()
    net_g.remove_weight_norm()
    return hps, net_g, utils


def _infer(hps, net_g, utils, text: str):
    from torch import no_grad, LongTensor
    if text is None or text == '':
        raise RuntimeError('empty text on stdin')
    if getattr(hps.data, 'text_cleaners', None) is None:
        raise RuntimeError('hps.data.text_cleaners is missing')
    cleaned = getattr(utils, 'text_to_sequence', None)
    if cleaned is None:
        raise RuntimeError('utils.text_to_sequence is missing in upstream utils.py')
    try:
        seq = cleaned(text, hps.data.text_cleaners)
    except Exception as e:
        raise RuntimeError(f'text_to_sequence failed (likely non-Japanese): {e}')
    if not seq:
        raise RuntimeError('text_to_sequence returned empty sequence (non-Japanese input?)')
    with no_grad():
        x_tst = LongTensor(seq).unsqueeze(0).cuda()
        x_tst_lengths = LongTensor([len(seq)]).cuda()
        audio = net_g.infer(x_tst, x_tst_lengths, noise_scale=.667, noise_scale_w=.6, length_scale=1.0)[0][0, 0].data.cpu().float().numpy()
    return audio, hps.data.sampling_rate


def main() -> int:
    args = _build_argparser().parse_args()
    text = _read_text_from_stdin()
    try:
        hps, net_g, utils = _load_vits(args.dir, args.config, args.model)
        audio, sr = _infer(hps, net_g, utils, text)
    except Exception as e:
        print(f'[anime-tts adapter] inference error: {e}', file=sys.stderr)
        return 2
    try:
        import numpy as np
        from scipy.io import wavfile
        # 上流 VITS 流儀: int16 変換
        audio_int16 = (np.clip(audio, -1.0, 1.0) * 32767.0).astype(np.int16)
        wavfile.write(args.out, sr, audio_int16)
    except Exception as e:
        print(f'[anime-tts adapter] wav write error: {e}', file=sys.stderr)
        return 3
    return 0


if __name__ == '__main__':
    sys.exit(main())
`;
