import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';

const prod = process.argv[2] === 'production';

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', ...builtins],
  format: 'cjs',
  target: 'es2022',
  sourcemap: 'inline',
  treeShaking: true,
  minify: prod,
  logLevel: 'info',
  outfile: 'main.js',
});

await ctx.rebuild();
process.exit(0);
