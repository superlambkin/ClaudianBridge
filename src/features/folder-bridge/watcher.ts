import { FolderBridgeFs } from './types';

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  absPath: string;
}

export type WatchEventHandler = (event: WatchEvent) => void;

export class FolderBridgeWatcher {
  private handle: ReturnType<FolderBridgeFs['watch']> | null = null;

  constructor(private fs: FolderBridgeFs) {}

  start(path: string, onEvent: WatchEventHandler): void {
    if (this.handle) this.stop();
    const events: Array<'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'> = [
      'add',
      'change',
      'unlink',
      'addDir',
      'unlinkDir',
    ];
    this.handle = this.fs.watch(path, { persistent: true, ignoreInitial: true });
    for (const event of events) {
      this.handle.on(event, (p: string) => onEvent({ type: event, absPath: p }));
    }
  }

  stop(): void {
    this.handle?.close();
    this.handle = null;
  }
}