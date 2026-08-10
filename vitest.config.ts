import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // obsidian は型定義のみのパッケージ（"main": ""）のため Node で解決不能。
      // テスト時はローカルスタブへ向ける（実ビルドでは esbuild external のまま）。
      // 相対 alias は vitest で無効なため絶対パスを使用。
      obsidian: fileURLToPath(new URL('./tests/mocks/obsidian.ts', import.meta.url)),
    },
  },
});
