import { describe, it, expect } from 'vitest';
import { convertFromVaultOfficeBridge } from '../../src/legacy/convert-vob';

describe('convertFromVaultOfficeBridge', () => {
  it('null 入力 → null', () => {
    expect(convertFromVaultOfficeBridge(null)).toBeNull();
  });
  it('期待される office 形式を返す', () => {
    const raw = {
      pythonPath: 'py',
      markitdownArgs: '',
      enabledExtensions: ['docx', 'pdf'],
      conflictPolicy: 'skip',
      frontmatterTemplate: '---\ntitle: {{title}}\n---',
      logLevel: 'warn',
      showProgressModal: false,
      outputDirOverride: 'C:/out',
    };
    const result = convertFromVaultOfficeBridge(raw);
    expect(result).toMatchObject({
      office: {
        enabled: true,
        pythonPath: 'py',
        markitdownArgs: '',
        enabledExtensions: ['docx', 'pdf'],
        conflictPolicy: 'skip',
        frontmatterTemplate: '---\ntitle: {{title}}\n---',
        logLevel: 'warn',
        showProgressModal: false,
        outputDirOverride: 'C:/out',
      },
    });
  });
  it('型違反はデフォルトで埋める', () => {
    const result = convertFromVaultOfficeBridge({ conflictPolicy: 'invalid', enabledExtensions: 'docx' });
    expect(result?.office.conflictPolicy).toBe('overwrite');
    expect(result?.office.enabledExtensions).toEqual(['docx', 'xlsx', 'pptx', 'pdf', 'html', 'htm', 'csv']);
  });
});
