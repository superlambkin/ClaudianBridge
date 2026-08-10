import type { ConversionItemResult } from './converter';

export class ConversionSummary {
  static toMarkdown(results: ConversionItemResult[]): string {
    const lines: string[] = ['## Conversion Summary', ''];
    lines.push('| # | ファイル | 結果 | 出力 |');
    lines.push('|---|---------|------|------|');
    results.forEach((r, i) => {
      const ok = r.ok ? '✅' : '⚠';
      const outputs = r.outputs.length > 0 ? r.outputs.join('<br>') : '-';
      lines.push(`| ${i + 1} | ${r.path} | ${ok} | ${outputs} |`);
    });
    return lines.join('\n');
  }
}
