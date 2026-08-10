import { Plugin } from 'obsidian';

export default class ClaudianBridgePlugin extends Plugin {
  async onload(): Promise<void> {
    console.log('[claudian-bridge] loaded');
  }

  onunload(): void {
    console.log('[claudian-bridge] unloaded');
  }
}
