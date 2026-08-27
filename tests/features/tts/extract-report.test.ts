// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractReportText, AUTO_READ_MARK, buildSpeechExclude, readVisibleTextExcluding, detectFinalAnswerState, collectStructuralExcludes } from '../../../src/features/tts/extract-report';

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

  it('ヘッダー: 📢・見出しが無い → null（タスク終了報告📢がない通常応答は読まない）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常の応答</p></div></div>`;
    expect(extractReportText(makeMessages(html), 'header')).toBeNull();
  });

  it('ヘッダー: 📢 が無く「🎯 結論」見出しがある → その節を読み、先頭に📢を付加', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>導入テキスト</p><h2>🎯 結論</h2><p>結論の内容です。詳細は後述。</p><h2>詳細</h2><p>詳細の内容</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'header');
    expect(text).not.toBeNull();
    expect(text!).toContain('📢 結論の内容です。詳細は後述。');
    expect(text!).not.toContain('導入テキスト');
    expect(text!).not.toContain('詳細の内容');
  });

  it('ヘッダー: 📢 が無く「🎯 実装方針」見出しがある → その節を読み、先頭に📢を付加', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><h2>🎯 実装方針</h2><p>実装の内容です。手順は以下の通り。</p><h2>詳細</h2><p>詳細の内容</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'header');
    expect(text).not.toBeNull();
    expect(text!).toContain('📢 実装の内容です。手順は以下の通り。');
    expect(text!).not.toContain('詳細の内容');
  });

  it('ヘッダー: 🎯 結論と🎯 実装方針が両方ある → 結論を優先', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><h2>🎯 実装方針</h2><p>実装内容</p><h2>🎯 結論</h2><p>結論内容</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'header');
    expect(text).not.toBeNull();
    expect(text!).toContain('📢 結論内容');
    expect(text!).not.toContain('実装内容');
  });

  it('ヘッダー: 🎯 結論と🎯 実装方針が逆順でも結論を優先', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><h2>🎯 結論</h2><p>結論内容</p><h2>🎯 実装方針</h2><p>実装内容</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'header');
    expect(text).not.toBeNull();
    expect(text!).toContain('📢 結論内容');
    expect(text!).not.toContain('実装内容');
  });

  it('ヘッダー: 🎯 結論・実装方針が無い → null', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><h2>詳細</h2><p>詳細の内容</p></div></div>`;
    expect(extractReportText(makeMessages(html), 'header')).toBeNull();
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

describe('detectFinalAnswerState (v0.19.0 最終回答ゲート)', () => {
  it('text-block 終端・非空 → ready', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content">
      <div class="claudian-thinking-block"><div class="claudian-thinking-content">思考</div></div>
      <div class="claudian-text-block"><p>最終回答</p></div>
    </div></div>`;
    expect(detectFinalAnswerState(makeMessages(html))).toBe('ready');
  });

  it('tool-call 終端 → intermediate', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content">
      <div class="claudian-thinking-block"><div class="claudian-thinking-content">思考</div></div>
      <div class="claudian-tool-call"><div class="claudian-tool-header">Tool Bash</div><div class="claudian-tool-summary">git status</div></div>
    </div></div>`;
    expect(detectFinalAnswerState(makeMessages(html))).toBe('intermediate');
  });

  it('thinking-block 終端 → intermediate', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content">
      <div class="claudian-thinking-block"><div class="claudian-thinking-content">思考のみ</div></div>
    </div></div>`;
    expect(detectFinalAnswerState(makeMessages(html))).toBe('intermediate');
  });

  it('text-block 空 → pending', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content">
      <div class="claudian-text-block"></div>
    </div></div>`;
    expect(detectFinalAnswerState(makeMessages(html))).toBe('pending');
  });

  it('.claudian-interrupted 含有 → intermediate', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content">
      <div class="claudian-text-block"><span class="claudian-interrupted">Interrupted</span></div>
    </div></div>`;
    expect(detectFinalAnswerState(makeMessages(html))).toBe('intermediate');
  });

  it('ブロッククラス無し・可視テキスト有り → ready（後方互換）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>通常応答</p></div></div>`;
    expect(detectFinalAnswerState(makeMessages(html))).toBe('ready');
  });

  it('ブロッククラス無し・テキスト無し → pending', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"></div></div>`;
    expect(detectFinalAnswerState(makeMessages(html))).toBe('pending');
  });

  it('assistant メッセージ無し → pending', () => {
    expect(detectFinalAnswerState(makeMessages('<p>空</p>'))).toBe('pending');
  });
});

describe('extractTextBlocks (v0.19.0 構造的除外)', () => {
  it('full scope: フィルタ全ONでも思考・ツールは読まない（テキストブロックのみ）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content">
      <div class="claudian-thinking-block"><div class="claudian-thinking-header">Thought for 1s</div><div class="claudian-thinking-content">思考の内容</div></div>
      <div class="claudian-tool-call"><div class="claudian-tool-header">Tool Bash</div><div class="claudian-tool-summary">git status</div></div>
      <div class="claudian-text-block"><p>最終回答のテキスト</p></div>
    </div></div>`;
    const allTrue = { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true, callout: true, table: true, code: true, thinking: true, toolCommands: true };
    const text = extractReportText(makeMessages(html), 'full', { filter: { ...allTrue } });
    expect(text).toContain('最終回答のテキスト');
    expect(text).not.toContain('思考の内容');
    expect(text).not.toContain('Thought for');
    expect(text).not.toContain('git status');
    expect(text).not.toContain('Tool Bash');
  });

  it('full scope: テキストブロック無し（旧DOM）は従来どおり全体を読む', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content"><p>旧DOMのテキスト</p></div></div>`;
    const text = extractReportText(makeMessages(html), 'full');
    expect(text).toContain('旧DOMのテキスト');
  });
});

describe('collectStructuralExcludes (v0.19.0 防御的強化)', () => {
  it('思考・ツールブロックを返す（テキストブロックは含まない）', () => {
    const el = document.createElement('div');
    el.innerHTML = '<div class="claudian-thinking-block"></div><div class="claudian-text-block"></div><div class="claudian-tool-call"></div>';
    const els = collectStructuralExcludes(el);
    expect(els.length).toBe(2);
    expect(els[0].className).toBe('claudian-thinking-block');
    expect(els[1].className).toBe('claudian-tool-call');
  });

  it('header scope: 思考・ツール混在メッセージでも 📢 のみ読む（回帰）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content">
      <div class="claudian-thinking-block"><div class="claudian-thinking-content">思考</div></div>
      <div class="claudian-tool-call"><div class="claudian-tool-header">Tool Bash</div><div class="claudian-tool-summary">git status</div></div>
      <div class="claudian-text-block"><blockquote><p>📢 完了報告</p></blockquote></div>
    </div></div>`;
    const text = extractReportText(makeMessages(html), 'header');
    expect(text).toContain('📢 完了報告');
    expect(text).not.toContain('思考');
    expect(text).not.toContain('Tool Bash');
    expect(text).not.toContain('git status');
  });
});

describe('v0.19.0 追加カバレッジ', () => {
  function makeMessages(inner: string): Element {
    const el = document.createElement('div');
    el.className = 'claudian-messages';
    el.innerHTML = inner;
    return el;
  }

  it('header scope: 📢 なし・🎯 結論あり → 🎯 結論の節を📢付きで読む', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content">
      <div class="claudian-thinking-block"><div class="claudian-thinking-content">思考の内容</div></div>
      <div class="claudian-tool-call"><div class="claudian-tool-header">Tool Bash</div><div class="claudian-tool-summary">git status</div></div>
      <div class="claudian-text-block"><p>導入</p><h2>🎯 結論</h2><p>結論の内容</p><h2>詳細</h2><p>詳細の本文</p></div>
    </div></div>`;
    const allTrue = { emoji: true, kaomoji: true, ascii_emoticon: true, emoji_shortcode: true, callout: true, table: true, code: true, thinking: true, toolCommands: true };
    const text = extractReportText(makeMessages(html), 'header', { filter: { ...allTrue } });
    expect(text).not.toBeNull();
    expect(text!).toContain('📢 結論の内容');
    expect(text!).not.toContain('思考の内容');
    expect(text!).not.toContain('git status');
    expect(text!).not.toContain('詳細の本文');
  });

  it('複数メッセージ: 最後のメッセージで判定する', () => {
    const older = `<div class="claudian-message-assistant"><div class="claudian-message-content"><div class="claudian-text-block"><p>古い回答</p></div></div></div>`;
    const latest = `<div class="claudian-message-assistant"><div class="claudian-message-content"><div class="claudian-tool-call"><div class="claudian-tool-header">Tool Bash</div></div></div></div>`;
    expect(detectFinalAnswerState(makeMessages(older + latest))).toBe('intermediate');
  });

  it('tool-call 後に text-block → ready（順序セマンティクス）', () => {
    const html = `<div class="claudian-message-assistant"><div class="claudian-message-content">
      <div class="claudian-tool-call"><div class="claudian-tool-header">Tool Bash</div></div>
      <div class="claudian-text-block"><p>最終回答</p></div>
    </div></div>`;
    expect(detectFinalAnswerState(makeMessages(html))).toBe('ready');
  });
});
