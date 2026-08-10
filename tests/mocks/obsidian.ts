// obsidian パッケージは型定義のみ（"main": ""）のため、vitest(Node 環境)では解決不能。
// 実装が実行時 import するシンボルのみをスタブとして提供する。
export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export class Plugin {
  app: App = new App();
}

export class App {}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement = (globalThis as { document?: Document }).document?.createElement('div') as HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
  }
}
