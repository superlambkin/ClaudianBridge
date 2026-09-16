import nodePath from 'path';
import { FolderBridge, FolderBridgeDeps, FolderBridgeState, ApplyAllResult } from './types';
import { ShadowReconciler } from './reconciler';
import { FolderBridgeWatcher, WatchEvent } from './watcher';

export class FolderBridgeManager {
  private reconciler: ShadowReconciler;
  private watchers = new Map<string, FolderBridgeWatcher>();
  private states = new Map<string, FolderBridgeState>();
  private bridges = new Map<string, FolderBridge>();

  constructor(private deps: FolderBridgeDeps) {
    this.reconciler = new ShadowReconciler(deps.fs);
  }

  applyAll(bridges: FolderBridge[]): ApplyAllResult {
    const result: ApplyAllResult = { totalLinked: 0, totalErrors: 0, notices: [] };
    for (const bridge of bridges) {
      if (!bridge.enabled) {
        if (this.watchers.has(bridge.id)) {
          this.disable(bridge.id, bridge);
        } else {
          this.setState(bridge.id, 'disabled');
        }
        continue;
      }
      try {
        this.applyOne(bridge);
        result.totalLinked++;
        const msg = `✅ ${bridge.linkName}: ${bridge.externalPath} を ${bridge.vaultSubpath}/${bridge.linkName} と同期中`;
        result.notices.push(msg);
        this.deps.notice(msg);
      } catch (e) {
        result.totalErrors++;
        const msg = `❌ ${bridge.linkName}: ${(e as Error).message}`;
        result.notices.push(msg);
        this.deps.notice(msg);
      }
    }
    return result;
  }

  pause(id: string): void {
    this.watchers.get(id)?.stop();
    this.setState(id, 'paused');
  }

  resume(id: string): void {
    this.setState(id, 'linked');
    // Restart watcher if bridge still exists in caller context
    // (Caller must pass bridge via applyAll again — see Task 9 wiring)
  }

  disable(id: string, bridge?: FolderBridge): void {
    this.watchers.get(id)?.stop();
    this.watchers.delete(id);
    const b = bridge ?? this.findBridge(id);
    if (b) {
      const junction = nodePath.join(this.deps.vaultBasePath, b.vaultSubpath, b.linkName);
      if (this.deps.fs.existsSync(junction)) {
        this.deps.fs.rmSync(junction, { recursive: true, force: true });
      }
    }
    this.setState(id, 'disabled');
  }

  status(id: string): { state: FolderBridgeState } {
    return { state: this.states.get(id) ?? 'disabled' };
  }

  /** Internal: handle a chokidar event for a bridge. */
  handleWatchEvent(bridge: FolderBridge, event: WatchEvent): void {
    try {
      const rel = nodePath.relative(bridge.externalPath, event.absPath);
      if (!rel || rel.startsWith('..')) return;
      const shadowTarget = nodePath.join(bridge.shadowPath, rel);
      if (event.type === 'unlink' || event.type === 'unlinkDir') {
        this.reconciler.removeFromShadow(shadowTarget);
      } else if (event.type === 'add' || event.type === 'change') {
        this.reconciler.syncOne(event.absPath, shadowTarget, bridge.excludePatterns);
      } else if (event.type === 'addDir') {
        this.deps.fs.mkdirSync(shadowTarget, { recursive: true });
      }
    } catch (e) {
      this.deps.notice(`⚠️ ${bridge.linkName}: 同期エラー ${(e as Error).message}`);
      this.setState(bridge.id, 'error');
    }
  }

  private applyOne(bridge: FolderBridge): void {
    // 1. Validate external path exists
    if (!this.deps.fs.existsSync(bridge.externalPath)) {
      this.setState(bridge.id, 'external_missing');
      throw new Error(`${bridge.externalPath} に到達できません`);
    }

    // 2. Track bridge so disable() can find it (Task 9 will add settings lookup)
    this.bridges.set(bridge.id, bridge);

    // 3. Initial sync
    this.setState(bridge.id, 'syncing');
    this.reconciler.syncAll(bridge.externalPath, bridge.shadowPath, bridge.excludePatterns);

    // 4. Create junction (Shadow を指す)
    const junction = nodePath.join(this.deps.vaultBasePath, bridge.vaultSubpath, bridge.linkName);
    if (this.deps.fs.existsSync(junction)) {
      this.deps.fs.rmSync(junction, { recursive: true, force: true });
    }
    this.deps.fs.symlinkSync(bridge.shadowPath, junction, 'junction');

    // 5. Start watcher
    this.watchers.get(bridge.id)?.stop();
    const watcher = new FolderBridgeWatcher(this.deps.fs);
    watcher.start(bridge.externalPath, (event) => this.handleWatchEvent(bridge, event));
    this.watchers.set(bridge.id, watcher);

    this.setState(bridge.id, 'linked');
  }

  private setState(id: string, state: FolderBridgeState): void {
    this.states.set(id, state);
    this.deps.logger?.('debug', `[folder-bridge] ${id} → ${state}`);
  }

  private findBridge(id: string): FolderBridge | undefined {
    return this.bridges.get(id);
  }
}