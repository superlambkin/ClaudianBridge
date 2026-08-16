// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractReportText, AUTO_READ_MARK, buildSpeechExclude, readVisibleTextExcluding } from '../../../src/features/tts/extract-report';

const REPORT_HTML = `
  <div class="claudian-message-assistant">
    <div class="claudian-message-content">
      <h6>✅ 完了 · テストタスク</h6>
      <blockquote>
        <p>📢 テストタスクを完了しました。</p>
        <p>検証は テスト 通過しました。</p>
      </blockquote>
      <hr>
      <p>詳細セクション（読まない）</p>
    </div>
  </div>`;

function makeMessages(inner: string): Element {
  const el = document.createElement('div');
  el.className = 'claudian-messages';
  el.innerHTML = inner;
  return el;
}

describe('extractReportText', () => {
  it('header scope: 📢 blockquote のテキストのみ抽出し、詳細を含まない', () => {
    const text = extractReportText(makeMessages(REPORT_HTML), 'header');
    expect(text).toContain('📢 テストタスクを完了しました。');
    expect(text).toContain('検証は テスト 通過しました。');
    expect(text).not.toContain('詳細セクション');
  });

  it('header scope: ✅ blockquote もまとめとして読む（v0.14.3）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><blockquote><p>✅ ビルド・コミット状況</p></blockquote><p>詳細の内容</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'header');
    expect(text).toContain('✅ ビルド・コミット状況');
    expect(text).not.toContain('詳細の内容');
  });

  it('full scope: メッセージ全文を抽出（詳細を含む）', () => {
    const text = extractReportText(makeMessages(REPORT_HTML), 'full');
    expect(text).toContain('📢 テストタスクを完了しました。');
    expect(text).toContain('詳細セクション');
  });

  it('full scope: 📢 が無くても最後の応答全文を返す（v0.13.0 全応答統一）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常の応答</p><p>詳細も含む</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'full');
    expect(text).toContain('通常の応答');
    expect(text).toContain('詳細も含む');
  });

  it('full scope: 📢 なし全文抽出も dedup マークで 2 回目は null', () => {
    const el = makeMessages(`<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常応答</p></div></div>`);
    expect(extractReportText(el, 'full')).not.toBeNull();
    expect(extractReportText(el, 'full')).toBeNull();
    expect(el.querySelector('.claudian-message-assistant')!.hasAttribute(AUTO_READ_MARK)).toBe(true);
  });

  it('full scope: 思考ブロック（Thought for）を読み上げに含めない', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><div class="claudian-thinking-block"><div class="claudian-thinking-header">Thought for 1s</div><div class="claudian-thinking-content">内部思考の内容</div></div><p>本体の応答テキスト</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'full');
    expect(text).toContain('本体の応答テキスト');
    expect(text).not.toContain('Thought for');
    expect(text).not.toContain('内部思考の内容');
  });

  it('full scope: 全 true フィルタでも空セレクタで例外を投げず全文を読む（v0.17）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><div class="claudian-thinking-block"><div class="claudian-thinking-header">Thought for 1s</div><div class="claudian-thinking-content">内部思考の内容</div></div><p>本体の応答テキスト</p></div></div>`;
    const allTrue = { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true, callout: true, table: true, code: true, thinking: true, toolCommands: true };
    const el = makeMessages(html);
    let text: string | null;
    expect(() => { text = extractReportText(el, 'full', { filter: { ...allTrue } }); }).not.toThrow();
    expect(text!).toContain('本体の応答テキスト');
  });

  it('full scope: コードブロック（言語ラベル含む）を読み上げに含めない', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>本文のテキスト</p><div class="claudian-code-wrapper"><span class="claudian-code-lang-label">bash</span><pre><code>echo hello</code></pre></div></div></div>`;
    const text = extractReportText(makeMessages(html), 'full');
    expect(text).toContain('本文のテキスト');
    expect(text).not.toContain('bash');
    expect(text).not.toContain('echo hello');
  });

  it('full scope: コールアウトを読み上げに含めない（既定 true）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>本文</p><div class="callout" data-callout="success"><div class="callout-title">成功</div><div class="callout-content"><p>コールアウトの内容</p></div></div></div></div>`;
    const text = extractReportText(makeMessages(html), 'full');
    expect(text).toContain('本文');
    expect(text).not.toContain('コールアウトの内容');
  });

  it('full scope: excludeCallouts=false ならコールアウトも読む', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>本文</p><div class="callout" data-callout="success"><div class="callout-title">成功</div><div class="callout-content"><p>コールアウトの内容</p></div></div></div></div>`;
    const text = extractReportText(makeMessages(html), 'full', { excludeCallouts: false });
    expect(text).toContain('コールアウトの内容');
  });

  it('ヘッダー: 📢・見出しが無い → null（v0.14.1）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常の応答</p></div></div>`;
    expect(extractReportText(makeMessages(html), 'header')).toBeNull();
  });

  it('ヘッダー: 📢 が無く見出しがある → 見出しより前の導入文だけを読む（v0.14.1）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>これは導入のまとめです。</p><h2>詳細</h2><p>詳細の内容は読まない。</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'header');
    expect(text).toContain('これは導入のまとめです。');
    expect(text).not.toContain('詳細の内容は読まない。');
  });

  it('ヘッダー: 📢 で始まらない blockquote は対象外 → 見出し前の導入文を読む', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>まとめの文章</p><blockquote><p>引用です</p></blockquote><h2>詳細</h2><p>詳細の内容</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'header');
    expect(text).toContain('まとめの文章');
    expect(text).not.toContain('詳細の内容');
  });

  it('ヘッダー: 一項目のみ（導入文なし・見出し1つ）→ その節を読む（テーブルは除外・v0.14.2）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><h2>ビルド・コミット状況</h2><table><tr><td>テーブルデータ</td></tr></table><p>最新の v0.14.2 が反映されています。</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'header');
    expect(text).toContain('ビルド・コミット状況');
    expect(text).toContain('最新の v0.14.2 が反映されています。');
    expect(text).not.toContain('テーブルデータ');
  });

  it('assistant メッセージが無い → null', () => {
    expect(extractReportText(makeMessages('<p>空</p>'), 'header')).toBeNull();
  });

  it('抽出済みマーク: 2回目は null（header）', () => {
    const el = makeMessages(REPORT_HTML);
    expect(extractReportText(el, 'header')).not.toBeNull();
    expect(extractReportText(el, 'header')).toBeNull();
    expect(el.querySelector('blockquote')!.hasAttribute(AUTO_READ_MARK)).toBe(true);
  });

  it('抽出済みマーク: 2回目は null（full はメッセージ要素にマーク）', () => {
    const el = makeMessages(REPORT_HTML);
    expect(extractReportText(el, 'full')).not.toBeNull();
    expect(extractReportText(el, 'full')).toBeNull();
    expect(el.querySelector('.claudian-message-assistant')!.hasAttribute(AUTO_READ_MARK)).toBe(true);
  });

  it('最後の assistant メッセージのみ対象（手前の 📢 は読まない）', () => {
    const older = REPORT_HTML;
    const latest = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>補足コメント</p></div></div>`;
    // 最後のメッセージに 📢・見出しが無い → header は null（手前の 📢 は対象外）
    expect(extractReportText(makeMessages(older + latest), 'header')).toBeNull();
  });
});

describe('buildSpeechExclude (v0.17 タイプ別)', () => {
  const T = { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true, callout: true, table: true, code: true, thinking: true, toolCommands: true };

  it('全 true なら除外なし（空文字）', () => {
    expect(buildSpeechExclude({ ...T })).toBe('');
  });

  it('thinking=false なら思考ブロックを除外', () => {
    const s = buildSpeechExclude({ ...T, thinking: false });
    expect(s).toContain('.claudian-thinking-block');
  });

  it('code=false ならコードブロックを除外', () => {
    const s = buildSpeechExclude({ ...T, code: false });
    expect(s).toContain('.claudian-code-wrapper');
  });

  it('callout=false ならコールアウトを除外', () => {
    const s = buildSpeechExclude({ ...T, callout: false });
    expect(s).toContain('.callout');
  });
});

describe('buildSpeechExclude (v0.18.1 toolCommands)', () => {
  const T = { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true, callout: true, table: true, code: true, thinking: true, toolCommands: true };

  it('toolCommands=false なら .claudian-tool-call を除外', () => {
    const s = buildSpeechExclude({ ...T, toolCommands: false });
    expect(s).toContain('.claudian-tool-call');
  });

  it('toolCommands=true なら .claudian-tool-call を含めない', () => {
    const s = buildSpeechExclude({ ...T });
    expect(s).not.toContain('.claudian-tool-call');
  });
});

describe('readVisibleTextExcluding (v0.18.1 tool call 除外)', () => {
  it('.claudian-tool-call を除去して本文のみ返す', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>本文です</p><div class="claudian-tool-call"><div class="claudian-tool-header">Tool Bash</div><div class="claudian-tool-summary">git status</div></div><p>末尾です</p>';
    const text = readVisibleTextExcluding(el, '.claudian-tool-call');
    expect(text).toContain('本文です');
    expect(text).toContain('末尾です');
    expect(text).not.toContain('Tool Bash');
    expect(text).not.toContain('git status');
  });
});
