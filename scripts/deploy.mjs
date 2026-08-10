import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const dest = join(
  homedir(),
  'OneDrive', 'Edge', 'Obsidian Vault',
  '.obsidian', 'plugins', 'claudian-bridge'
);

mkdirSync(dest, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  copyFileSync(join(process.cwd(), file), join(dest, file));
  console.log(`✅ ${file} -> ${dest}`);
}
console.log('🎉 Deploy complete. Enable "Claudian Bridge" in Obsidian Community Plugins.');
