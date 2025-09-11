import {getProjectsDirectory} from '../config.js';
import type {SyncServerOptions} from './types.js';
import {DevTeamEngine} from '../engine/DevTeamEngine.js';
// Server now relays engine snapshots directly; engine attaches git/PR/status.

export class SyncServer {
  private options: Required<SyncServerOptions>;
  private version = 1;
  // Server no longer refreshes; engine emits on changes
  private engine!: DevTeamEngine;
  // No separate git cache here; engine is source of truth

  constructor(opts: SyncServerOptions = {}) {
    this.options = {
      postUrl: opts.postUrl ?? 'http://127.0.0.1:3000/api/snapshots/push',
      refreshIntervalMs: opts.refreshIntervalMs ?? 5000,
      gitRefreshIntervalMs: opts.gitRefreshIntervalMs ?? 15000,
    } as Required<SyncServerOptions>;
  }

  async start(): Promise<{postUrl: string}> {
    // Engine provides snapshots when changed; we still tick to refresh tmux/AI state
    const projectsDir = getProjectsDirectory();
    this.engine = new DevTeamEngine({projectsDir});
    this.engine.on('snapshot', (snap) => this.postSnapshot(snap));
    await this.engine.start?.();
    return {postUrl: this.options.postUrl};
  }

  async stop(): Promise<void> {
    try { await this.engine.stop?.(); } catch {}
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

  // No mergeGitCache/refreshGitCache; engine drives snapshots

  // No watchers here; engine owns change detection
}

export function createSyncServer(options: SyncServerOptions = {}) {
  return new SyncServer(options);
}
