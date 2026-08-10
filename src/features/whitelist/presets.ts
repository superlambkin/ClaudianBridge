export interface WhitelistPreset {
  name: string;
  extensions: string[];
  desc: string;
}

export const WHITELIST_PRESETS: ReadonlyArray<WhitelistPreset> = [
  { name: '📄 Obsidian標準', extensions: ['md', 'canvas'], desc: 'Markdown + Canvasのみ' },
  { name: '📊 Office', extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'], desc: 'Word/Excel/PowerPoint' },
  { name: '🖼️ 画像', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'], desc: '一般的な画像形式' },
  { name: '💻 コード', extensions: ['js', 'ts', 'py', 'json', 'yaml', 'xml', 'css', 'html', 'sh'], desc: 'ソースコード類' },
  { name: '📦 ALL', extensions: ['*'], desc: 'すべて表示（フィルター解除）' },
];
