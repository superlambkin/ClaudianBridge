import { TFile } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type { OfficeSettings } from '../../core/settings';
import { VaultPath } from './path';
import { FrontmatterApplier } from './frontmatter';
import { MarkItDownRunner } from './markitdown';
import { SplitterRunner } from './splitter';
import { ProgressModal } from './progress-modal';

function localDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type SplitMode = 'single' | 'split';

export interface ConversionItemResult {
  path: string;
  ok: boolean;
  message: string;
  outputs: string[];
}

export interface OfficeConverterOptions {
  split: SplitMode;
}

export class OfficeConverter {
  static async convertItem(
    app: { vault: { adapter: { basePath: string } } },
    file: TFile,
    opts: OfficeConverterOptions,
    settings: OfficeSettings,
    modal: ProgressModal,
    pluginDir?: string
  ): Promise<ConversionItemResult> {
    const adapter = app.vault.adapter as { getBasePath?: () => string; basePath?: string };
    const vaultRoot = adapter.getBasePath ? adapter.getBasePath() : (adapter.basePath ?? process.cwd());
    const srcAbs = VaultPath.absolute(vaultRoot, file.path);
    const ext = file.extension.toLowerCase();

    modal.setStage('Reading source', 'running');
    try {
      await fs.promises.access(srcAbs);
    } catch {
      modal.setStage('Reading source', 'fail');
      modal.appendLog(`[ERROR] file not found: ${srcAbs}`);
      modal.setButtonsEnabled({ copy: true, open: false, retry: true, settings: true });
      return { path: file.path, ok: false, message: 'not found', outputs: [] };
    }
    modal.setStage('Reading source', 'ok');

    modal.setStage('Invoking markitdown', 'running');
    modal.setProgress(20);
    const md = await MarkItDownRunner.run(srcAbs, settings, vaultRoot, pluginDir);
    if (md.exitCode !== 0) {
      modal.setStage('Invoking markitdown', 'fail');
      modal.appendLog(md.stderr || `exitCode=${md.exitCode}`);
      modal.setButtonsEnabled({ copy: true, open: false, retry: true, settings: true });
      return { path: file.path, ok: false, message: 'markitdown failed', outputs: [] };
    }
    modal.setStage('Invoking markitdown', 'ok');
    modal.setProgress(45);

    const buffer = await fs.promises.readFile(srcAbs);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 8);
    const fmApplied = FrontmatterApplier.expand(settings.frontmatterTemplate, {
      title: file.basename,
      sourcePath: file.path,
      date: localDateTime(),
      ext,
      sizeBytes: buffer.byteLength,
      sha256,
    });
    const fullMd = `${fmApplied}\n\n${md.stdout}`;

    modal.setStage('Writing main .md', 'running');
    const { dir, stem } = VaultPath.splitName(file.path);
    const outputDirAbs = settings.outputDirOverride ? path.resolve(settings.outputDirOverride) : path.dirname(srcAbs);
    const outputDirRel = settings.outputDirOverride ? path.basename(outputDirAbs) : dir;
    const mainName = settings.conflictPolicy === 'timestamp' ? `${stem}_${Date.now()}` : stem;
    const mainRel = path.posix.join(outputDirRel, `${mainName}.md`);
    const mainAbs = path.join(outputDirAbs, `${mainName}.md`);
    if (settings.conflictPolicy === 'skip') {
      try {
        await fs.promises.access(mainAbs);
        modal.setStage('Writing main .md', 'ok');
        modal.appendLog(`[SKIP] ${mainRel} (exists)`);
        modal.setButtonsEnabled({ copy: true, open: true, retry: true, settings: true });
        return { path: file.path, ok: false, message: 'skipped (exists)', outputs: [mainRel] };
      } catch {
        /* not exists → proceed to write */
      }
    }
    await fs.promises.mkdir(path.dirname(mainAbs), { recursive: true });
    await fs.promises.writeFile(mainAbs, fullMd, 'utf8');
    modal.setStage('Writing main .md', 'ok');
    modal.setProgress(65);
    modal.appendLog(`[OK] ${mainRel}`);

    const outputs: string[] = [mainRel];

    if (opts.split === 'split') {
      modal.setStage('Splitting (optional)', 'running');
      const splitDirAbs = path.join(outputDirAbs, `${mainName}_split`);
      const splitDirRel = path.posix.join(outputDirRel, `${mainName}_split`);
      const r = await SplitterRunner.split(ext, mainAbs, srcAbs, splitDirAbs, settings, vaultRoot, pluginDir);
      if (r.exitCode !== 0) {
        modal.setStage('Splitting (optional)', 'fail');
        modal.appendLog(`[WARN] splitter exitCode=${r.exitCode}: ${r.stderr}`);
        modal.setButtonsEnabled({ copy: true, open: true, retry: true, settings: true });
        return { path: file.path, ok: false, message: 'splitter failed', outputs };
      }
      outputs.push(...r.outputs.map((a) => path.posix.join(splitDirRel, path.basename(a))));
      modal.setStage('Splitting (optional)', 'ok');
      modal.appendLog(`[OK] ${r.outputs.length} split files`);
    }

    modal.setProgress(100);
    modal.appendLog('🎉 変換が完了しました');
    modal.setButtonsEnabled({ copy: true, open: true, retry: true, settings: true });
    return { path: file.path, ok: true, message: 'ok', outputs };
  }

  static async convertMany(
    app: { vault: { adapter: { basePath: string } } },
    files: TFile[],
    opts: OfficeConverterOptions,
    settings: OfficeSettings,
    modal: ProgressModal,
    pluginDir?: string
  ): Promise<ConversionItemResult[]> {
    const results: ConversionItemResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      modal.setProgress(Math.round((i / files.length) * 100));
      modal.appendLog(`--- ${i + 1}/${files.length} ${f.path} ---`);
      try {
        results.push(await OfficeConverter.convertItem(app, f, opts, settings, modal, pluginDir));
      } catch (e) {
        results.push({ path: f.path, ok: false, message: String(e), outputs: [] });
      }
    }
    const anyOk = results.some((r) => r.ok);
    modal.setButtonsEnabled({ copy: true, open: anyOk, retry: true, settings: true });
    return results;
  }
}
