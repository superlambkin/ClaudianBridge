import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const prod = process.argv[2] === 'production';

// Auto-deploy after every successful build in watch mode.
const deployPlugin = {
  name: 'auto-deploy',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        console.error('⚠️ Build errors — skipping deploy.');
        return;
      }
      const deployScript = fileURLToPath(new URL('./scripts/deploy.mjs', import.meta.url));
      const res = spawnSync(process.execPath, [deployScript], { stdio: 'inherit' });
      if (res.status !== 0) {
        console.error('⚠️ Deploy failed — see output above.');
      }
    });
  },
};

const options = {
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
};

if (!prod) {
  options.plugins = [deployPlugin];
}

const ctx = await esbuild.context(options);

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
