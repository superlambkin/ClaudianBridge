import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // obsidian は型定義のみのパッケージ（"main": ""）のため Node で解決不能。
      // テスト時はローカルスタブへ向ける（実ビルドでは esbuild external のまま）。
      obsidian: './tests/mocks/obsidian.ts',
    },
  },
});
