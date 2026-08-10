import { App, Menu, MenuItem, TFile, Workspace, Notice } from 'obsidian';
import type { OfficeSettings } from '../../core/settings';
import { OfficeConverter, type SplitMode } from './converter';
import { ProgressModal } from './progress-modal';
import { ConversionSummary } from './summary';
import type { ConversionItemResult } from './converter';

type OnFn = (e: string, h: (...a: unknown[]) => void) => unknown;
interface PluginHost { registerEvent(e: unknown): void; }

// Obsidian's DataAdapter type does not declare basePath (it is set at runtime on the
// filesystem adapter). OfficeConverter requires it, so expose it as an intersection.
type AppWithBasePath = App & { vault: { adapter: { basePath: string } } };

function openInVault(app: App, vaultRelPath: string | undefined): void {
  if (!vaultRelPath) return;
  const f = app.vault.getAbstractFileByPath(vaultRelPath);
  if (f instanceof TFile) void app.workspace.getLeaf(false).openFile(f);
  else new Notice(`[claudian-bridge] not found: ${vaultRelPath}`);
}

async function runConvert(opts: {
  app: App;
  file: TFile;
  split: SplitMode;
  settings: OfficeSettings;
  title: string;
  onOpenSettings: () => void;
}): Promise<void> {
  let outputs: string[] = [];
  const modal = new ProgressModal(opts.app, {
    title: opts.title,
    onOpenSettings: () => { modal.close(); opts.onOpenSettings(); },
    onCopyLog: () => { void navigator.clipboard.writeText(modal.getLogText()); new Notice('📋 Log copied to clipboard'); },
    onOpenResult: () => openInVault(opts.app, outputs[0]),
    onRetry: () => { modal.close(); void runConvert(opts); },
    showSplit: opts.split === 'single',
    onConvertSplit: () => {
      modal.close();
      void runConvert({ ...opts, split: 'split', title: `📄 Convert & Split: ${opts.file.basename}.${opts.file.extension}` });
    },
  });
  modal.open();
  try {
    const r = await OfficeConverter.convertItem(opts.app as AppWithBasePath, opts.file, { split: opts.split }, opts.settings, modal);
    outputs = r.outputs;
    if (r.ok && opts.split === 'single') {
      modal.setButtonsEnabled({ copy: true, open: true, retry: true, settings: true, split: true });
    }
  } catch (e) {
    new Notice(`[claudian-bridge] error: ${String(e)}`);
    modal.appendLog(`[ERROR] ${String(e)}`);
    modal.setButtonsEnabled({ copy: true, open: false, retry: true, settings: true });
  }
}

async function runConvertMany(opts: {
  app: App;
  files: TFile[];
  settings: OfficeSettings;
  title: string;
  onOpenSettings: () => void;
}): Promise<void> {
  let outputs: string[] = [];
  const modal = new ProgressModal(opts.app, {
    title: opts.title,
    onOpenSettings: () => { modal.close(); opts.onOpenSettings(); },
    onCopyLog: () => { void navigator.clipboard.writeText(modal.getLogText()); new Notice('📋 Log copied to clipboard'); },
    onOpenResult: () => openInVault(opts.app, outputs[0]),
    onRetry: () => { modal.close(); void runConvertMany(opts); },
  });
  modal.open();
  try {
    const results: ConversionItemResult[] = await OfficeConverter.convertMany(opts.app as AppWithBasePath, opts.files, { split: 'single' }, opts.settings, modal);
    outputs = results.filter((r) => r.ok).flatMap((r) => r.outputs);
    modal.appendLog('\n' + ConversionSummary.toMarkdown(results));
  } catch (e) {
    new Notice(`[claudian-bridge] error: ${String(e)}`);
    modal.appendLog(`[ERROR] ${String(e)}`);
    modal.setButtonsEnabled({ copy: true, open: false, retry: true, settings: true });
  }
}

export class OfficeMenuRegistrar {
  static registerFileMenu(plugin: PluginHost, app: App, settingsRef: () => OfficeSettings, onOpenSettings: () => void): void {
    const workspace = app.workspace as Workspace;
    const handler = (menu: Menu, file: TFile | string): void => {
      if (!(file instanceof TFile)) return;
      if (!settingsRef().enabled) return;
      const ext = file.extension.toLowerCase();
      if (!settingsRef().enabledExtensions.includes(ext)) return;
      menu.addItem((item: MenuItem) => {
        item.setTitle('Convert to Markdown').setIcon('file-text');
        item.onClick(() => {
          void runConvert({ app, file, split: 'single', settings: settingsRef(), title: `📄 Convert: ${file.basename}.${ext}`, onOpenSettings });
        });
      });
      menu.addItem((item: MenuItem) => {
        item.setTitle('Convert & Split').setIcon('split');
        item.onClick(() => {
          void runConvert({ app, file, split: 'split', settings: settingsRef(), title: `📄 Convert & Split: ${file.basename}.${ext}`, onOpenSettings });
        });
      });
    };
    plugin.registerEvent((workspace as unknown as { on: OnFn }).on('file-menu', handler as (...a: unknown[]) => void));
  }

  static registerMultiSelect(plugin: PluginHost, app: App, settingsRef: () => OfficeSettings, onOpenSettings: () => void): void {
    const workspace = app.workspace as Workspace;
    const handler = (menu: Menu, files: TFile[] | TFile): void => {
      if (!settingsRef().enabled) return;
      const arr = Array.isArray(files) ? files : [files];
      if (arr.length < 2) return;
      const targets = arr.filter((f) => settingsRef().enabledExtensions.includes(f.extension.toLowerCase()));
      if (targets.length < 2) return;
      menu.addItem((item: MenuItem) => {
        item.setTitle(`Convert all (${targets.length}) to Markdown`).setIcon('file-stack');
        item.onClick(() => {
          void runConvertMany({ app, files: targets, settings: settingsRef(), title: `📄 Convert all (${targets.length} files)`, onOpenSettings });
        });
      });
    };
    plugin.registerEvent((workspace as unknown as { on: OnFn }).on('files-menu', handler as (...a: unknown[]) => void));
  }
}
