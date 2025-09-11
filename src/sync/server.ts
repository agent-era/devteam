import type {SyncServerOptions} from './types.js';
import {startSyncBridge} from './bridge.js';

export class SyncServer {
  private options: Required<SyncServerOptions>;
  private version = 1;
  private bridge: {stop: () => void} | null = null;
  // No separate git cache here; engine is source of truth

  constructor(opts: SyncServerOptions = {}) {
    this.options = {
      postUrl: opts.postUrl ?? 'http://127.0.0.1:3000/api/snapshots/push',
      refreshIntervalMs: opts.refreshIntervalMs ?? 5000,
      gitRefreshIntervalMs: opts.gitRefreshIntervalMs ?? 15000,
    } as Required<SyncServerOptions>;
  }

  async start(): Promise<{postUrl: string}> {
    // Start a headless bridge that subscribes to WorktreeContext and posts snapshots
    this.bridge = startSyncBridge(this.options.postUrl);
    return {postUrl: this.options.postUrl};
  }

  async stop(): Promise<void> {
    try { this.bridge?.stop(); } catch {}
    // Nothing else to close in HTTP-post mode
  }

  private async pushWorktreesToSubscribers() { /* no-op */ }

  private async postSnapshot(snap: {version: number; items: any[]}) {
    this.version = snap.version;
    const payload = {type: 'worktrees.snapshot', version: snap.version, items: snap.items};
    try {
      await fetch(this.options.postUrl, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SyncServer] Failed to POST snapshot to web server:', err);
    }
  }

  // No mergeGitCache/refreshGitCache; context + services drive updates
}

export function createSyncServer(options: SyncServerOptions = {}) {
  return new SyncServer(options);
}
