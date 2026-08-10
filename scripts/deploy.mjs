import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const dest = join(
  homedir(),
  'OneDrive', 'Edge', 'Obsidian Vault',
  '.obsidian', 'plugins', 'claudian-bridge'
);

mkdirSync(dest, { recursive: true });
const files = [
  { src: 'main.js', dst: 'main.js' },
  { src: 'src/manifest.json', dst: 'manifest.json' },
  { src: 'styles.css', dst: 'styles.css' },
];
for (const { src, dst } of files) {
  copyFileSync(join(process.cwd(), src), join(dest, dst));
  console.log(`✅ ${src} -> ${dest}/${dst}`);
}
console.log('🎉 Deploy complete. Enable "Claudian Bridge" in Obsidian Community Plugins.');
