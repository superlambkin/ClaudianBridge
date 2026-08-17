import { describe, it, expect, vi } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import { BackupMenuRegistrar } from '../../../src/features/backup/menu';
import type { ClaudianBridgeSettings } from '../../../src/core/settings';

interface MenuItemMock { setTitle: ReturnType<typeof vi.fn>; setIcon: ReturnType<typeof vi.fn>; onClick: ReturnType<typeof vi.fn>; }
interface MenuMock { addItem: ReturnType<typeof vi.fn>; }

function makeItem(): MenuItemMock {
  const item: Partial<MenuItemMock> = {};
  item.setTitle = vi.fn(() => item as MenuItemMock);
  item.setIcon = vi.fn(() => item as MenuItemMock);
  item.onClick = vi.fn(() => item as MenuItemMock);
  return item as MenuItemMock;
}

function makeMenu(): MenuMock {
  return { addItem: vi.fn((cb: (item: MenuItemMock) => MenuItemMock) => cb(makeItem())) };
}

function makeApp() {
  const handlers: Array<(menu: MenuMock, file: unknown) => void> = [];
  return {
    app: {
      workspace: {
        on: (event: string, handler: (menu: MenuMock, file: unknown) => void) => {
          handlers.push(handler);
          return { event, handler };
        },
      },
    },
    handlers,
  };
}

function makePlugin() {
  return { registerEvent: vi.fn() };
}

function makeSettingsRef(enabled: boolean): () => ClaudianBridgeSettings {
  return () => ({ ...({} as ClaudianBridgeSettings), general: { ...({} as ClaudianBridgeSettings.general), backupEnabled: enabled } });
}

function makeFile(): TFile {
  // Brief provides `{ path, basename, extension } as unknown as TFile` but the implementation
  // uses `file instanceof TFile`, so we must construct an actual TFile instance for the test to pass.
  return new TFile('note.md', 'note', 'md');
}

function makeFolder(): TFolder {
  return new TFolder('folder', 'folder');
}

describe('BackupMenuRegistrar', () => {
  it('register() が workspace.on("file-menu", ...) を呼ぶ', () => {
    const { app, handlers } = makeApp();
    const plugin = makePlugin();
    const settingsRef = makeSettingsRef(true);

    BackupMenuRegistrar.register(plugin as unknown as Parameters<typeof BackupMenuRegistrar.register>[0], app as unknown as App, settingsRef);

    expect(handlers.length).toBe(1);
    expect(plugin.registerEvent).toHaveBeenCalledOnce();
  });

  it('backupEnabled=true かつ TFile → menu.addItem が呼ばれる', () => {
    const { app, handlers } = makeApp();
    const plugin = makePlugin();
    const settingsRef = makeSettingsRef(true);
    BackupMenuRegistrar.register(plugin as unknown as Parameters<typeof BackupMenuRegistrar.register>[0], app as unknown as App, settingsRef);

    const menu = makeMenu();
    handlers[0](menu, makeFile());

    expect(menu.addItem).toHaveBeenCalledOnce();
  });

  it('backupEnabled=true かつ TFolder → menu.addItem が呼ばれる', () => {
    const { app, handlers } = makeApp();
    const plugin = makePlugin();
    const settingsRef = makeSettingsRef(true);
    BackupMenuRegistrar.register(plugin as unknown as Parameters<typeof BackupMenuRegistrar.register>[0], app as unknown as App, settingsRef);

    const menu = makeMenu();
    handlers[0](menu, makeFolder());

    expect(menu.addItem).toHaveBeenCalledOnce();
  });

  it('backupEnabled=false → menu.addItem が呼ばれない', () => {
    const { app, handlers } = makeApp();
    const plugin = makePlugin();
    const settingsRef = makeSettingsRef(false);
    BackupMenuRegistrar.register(plugin as unknown as Parameters<typeof BackupMenuRegistrar.register>[0], app as unknown as App, settingsRef);

    const menu = makeMenu();
    handlers[0](menu, makeFile());

    expect(menu.addItem).not.toHaveBeenCalled();
  });

  it('引数が文字列（TFile/TFolder 以外）→ menu.addItem が呼ばれない', () => {
    const { app, handlers } = makeApp();
    const plugin = makePlugin();
    const settingsRef = makeSettingsRef(true);
    BackupMenuRegistrar.register(plugin as unknown as Parameters<typeof BackupMenuRegistrar.register>[0], app as unknown as App, settingsRef);

    const menu = makeMenu();
    handlers[0](menu, 'some/string/path.md');

    expect(menu.addItem).not.toHaveBeenCalled();
  });
});
