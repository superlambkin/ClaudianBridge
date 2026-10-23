import { describe, it, expect } from 'vitest';
import { scanText, mask } from '../../scripts/check-secrets.mjs';

describe('scanText', () => {
  it('OpenAI/Anthropic 形式のキーを検出する', () => {
    const findings = scanText('const k = "sk-abcdefghijklmnopqrstuvwxyz0123456789";');  // secret-scan:allow（検出テスト用フィクスチャ）
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toContain('形式キー');
    expect(findings[0].line).toBe(1);
  });

  it('GitHub トークンを検出する', () => {
    const findings = scanText('token: ghp_' + 'a'.repeat(36));
    expect(findings.some((f) => f.rule === 'GitHub トークン')).toBe(true);
  });

  it('AWS アクセスキーを検出する', () => {
    expect(scanText('AKIAZZZZZZZZZZZZZZZZ').length).toBeGreaterThan(0);  // secret-scan:allow（検出テスト用フィクスチャ）
  });

  it('秘密鍵ブロックを検出する', () => {
    expect(scanText('-----BEGIN RSA PRIVATE KEY-----').length).toBe(1);  // secret-scan:allow（検出テスト用フィクスチャ）
  });

  it('api_key への 20 文字以上の代入を検出する', () => {
    expect(scanText('api_key = "0123456789abcdefghij"').length).toBe(1);  // secret-scan:allow（検出テスト用フィクスチャ）
  });

  it('環境変数参照は検出しない', () => {
    expect(scanText('api_key: "${MINIMAX_API_KEY}"')).toHaveLength(0);
  });

  it('プレースホルダ・マスク済み表記は検出しない', () => {
    expect(scanText('sk-cp-... 100 文字超')).toHaveLength(0);
    expect(scanText('api_key: "***REMOVED***"')).toHaveLength(0);
    expect(scanText('password: "example1234example"')).toHaveLength(0);
  });

  it('secret-scan:allow 付きの行は除外する', () => {
    const line = 'sk-abcdefghijklmnopqrstuvwxyz0123456789 // secret-scan:allow';
    expect(scanText(line)).toHaveLength(0);
  });

  it('複数行の行番号を返す', () => {
    const text = ['clean', 'ghp_' + 'b'.repeat(36), 'clean'].join('\n');
    expect(scanText(text)[0].line).toBe(2);
  });

  // R1: 実際に漏洩したのは引用符なしの YAML だった。引用符任意で検出できること。
  it('R1: 引用符なしの代入を検出する', () => {
    expect(scanText('api_key: 0123456789abcdefghij').length).toBe(1);  // secret-scan:allow（検出テスト用フィクスチャ）
    expect(scanText('DEEPSEEK_API_KEY=0123456789abcdefghij').length).toBe(1);  // secret-scan:allow（検出テスト用フィクスチャ）
  });

  // R2: MiniMax は JWT 風のキー。provider 別パターンが無いと素通りしていた。
  it('R2: JWT 形式のキーを検出する', () => {
    const jwt = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'eyJzdWIiOiIxMjM0NTY3ODkwIn0',
      'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    ].join('.');
    expect(scanText(`key: ${jwt}`).length).toBeGreaterThan(0);  // secret-scan:allow（検出テスト用フィクスチャ）
  });

  // R3: コード上の参照（プロパティアクセス）を秘密情報と誤認しないこと。
  it('R3: コード内のプロパティ参照は検出しない', () => {
    expect(scanText('apiKey: quota.deepseekApiKey,')).toHaveLength(0);
    expect(scanText("password: typeof r.password === 'string' ? r.password : DEFAULT_OPEN_VPN_SETTINGS.password,")).toHaveLength(0);
  });
});

describe('mask', () => {
  it('先頭 4 文字と長さだけを残す', () => {
    const out = mask('sk-abcdefghijklmnop');
    expect(out.startsWith('sk-a')).toBe(true);
    expect(out).not.toContain('bcdefghijklmnop');
  });

  // M3: Bearer トークン等の先頭 4 文字は情報漏えいになる。
  // recognized な接頭辞のときだけ先頭を出す。
  it('M3: 未知の接頭辞では先頭文字を出さない', () => {
    const out = mask('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef');
    expect(out.startsWith('eyJh')).toBe(false);
    expect(out).not.toContain('eyJhbGci');
    expect(out).toContain('文字');
  });

  it('M3: 既知の接頭辞（sk- 等）は先頭 4 文字を出す', () => {
    const out = mask('sk-abcdefghijklmnop');
    expect(out.startsWith('sk-a')).toBe(true);
  });
});
