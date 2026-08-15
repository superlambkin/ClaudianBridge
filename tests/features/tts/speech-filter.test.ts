// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { filterSpeechText } from '../../../src/features/tts/core';

describe('filterSpeechText', () => {
  it('emoji を除去する', () => {
    expect(filterSpeechText('📢 タスク完了しました', { emoji: true })).not.toContain('📢');
    expect(filterSpeechText('📢 タスク完了しました', { emoji: true })).toContain('タスク完了しました');
  });

  it('emoji 除去が OFF なら残す', () => {
    expect(filterSpeechText('📢 タスク完了', { emoji: false })).toContain('📢');
  });

  it('顔文字（括弧内に特徴文字 2 つ以上）を除去する', () => {
    // (^^) は ^ が2つ → 顔文字と判定
    expect(filterSpeechText('確認しました(^^)', { kaomoji: true })).not.toContain('(^^)');
    expect(filterSpeechText('確認しました(^^)', { kaomoji: true })).toContain('確認しました');
    // (確認) は特徴文字なし → 残す
    expect(filterSpeechText('(確認)しました', { kaomoji: true })).toContain('(確認)');
  });

  it('ASCII 表情を除去する', () => {
    expect(filterSpeechText('完了しました :)', { ascii_emoticon: true })).not.toContain(':)');
    expect(filterSpeechText('完了しました :)', { ascii_emoticon: true })).toContain('完了しました');
    expect(filterSpeechText('完了しました :)', { ascii_emoticon: false })).toContain(':)');
  });

  it('emoji 短コードを除去する', () => {
    expect(filterSpeechText('完了 :tada:', { emoji_shortcode: true })).not.toContain(':tada:');
    expect(filterSpeechText('完了 :tada:', { emoji_shortcode: true })).toContain('完了');
    expect(filterSpeechText('完了 :tada:', { emoji_shortcode: false })).toContain(':tada:');
  });

  it('sf 未指定ならデフォルト（全最適化 ON）', () => {
    const out = filterSpeechText('📢 完了(^^) :tada:');
    expect(out).not.toContain('📢');
    expect(out).not.toContain(':tada:');
    expect(out).not.toContain('(^^)');
  });

  it('部分指定は残りのキーをデフォルト ON にする', () => {
    // emoji だけ指定（true）→ 他もデフォルト ON
    const out = filterSpeechText('📢 完了 :tada:', { emoji: true });
    expect(out).not.toContain('📢');
    expect(out).not.toContain(':tada:');
  });

  it('最適化後に空の括弧対を除去する', () => {
    expect(filterSpeechText('完了 ( )', { kaomoji: true })).not.toContain('( )');
    expect(filterSpeechText('完了 ( )', { kaomoji: true })).toContain('完了');
  });

  it('日本語テキストはそのまま残す', () => {
    const text = 'タスクを完了しました。検証は正常に通過しました。';
    expect(filterSpeechText(text)).toBe(text);
  });
});
