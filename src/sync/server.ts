import chokidar from 'chokidar';
import {getProjectsDirectory} from '../config.js';
import type {SyncServerOptions} from './types.js';
import {DevTeamEngine} from '../engine/DevTeamEngine.js';
// Server now relays engine snapshots directly; engine attaches git/PR/status.

export class SyncServer {
  private options: Required<SyncServerOptions>;
  private version = 1;
  private timer?: NodeJS.Timeout;
  private gitTimer?: NodeJS.Timeout;
  private watcher?: chokidar.FSWatcher;
  private immediatePushTimer?: NodeJS.Timeout;
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
    await (this.engine as any).refreshProgressive?.() || this.engine.refreshNow();
    this.timer = setInterval(() => { void ((this.engine as any).refreshProgressive?.() || this.engine.refreshNow()); }, this.options.refreshIntervalMs);
    // Engine handles git/PR/status refresh; no separate server timers
    this.setupWatchers();
    return {postUrl: this.options.postUrl};
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.gitTimer) clearInterval(this.gitTimer);
    try { await this.watcher?.close(); } catch {}
    // Nothing else to close in HTTP-post mode
  }

  private async pushWorktreesToSubscribers() {
    // Progressive refresh trigger; engine emits snapshots which will be posted
    await this.engine.refreshNow();
  }

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

  private setupWatchers() {
    try {
      const base = getProjectsDirectory();
      // Watch all "*-branches" directories under the base projects dir for file/dir changes
      const globs = [`${base}/*-branches/**`];
      this.watcher = chokidar.watch(globs, {ignoreInitial: true, depth: 3});
      const onFsEvent = () => this.scheduleImmediatePush();
      this.watcher.on('add', onFsEvent).on('addDir', onFsEvent).on('unlink', onFsEvent).on('unlinkDir', onFsEvent).on('change', onFsEvent);
    } catch {}
  }

  private async scheduleImmediatePush() {
    if (this.immediatePushTimer) clearTimeout(this.immediatePushTimer);
    this.immediatePushTimer = setTimeout(async () => {
      await ((this.engine as any).refreshProgressive?.() || this.engine.refreshNow());
    }, 250); // debounce bursts
  }
}

export function createSyncServer(options: SyncServerOptions = {}) {
  return new SyncServer(options);
}
