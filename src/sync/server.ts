import http from 'node:http';
import {WebSocketServer, WebSocket} from 'ws';
import {parse as parseUrl} from 'node:url';
import chokidar from 'chokidar';
import {getProjectsDirectory} from '../config.js';
import type {ClientToServer, ServerToClient, SyncServerOptions} from './types.js';
import {DevTeamEngine} from '../engine/DevTeamEngine.js';
// Server now relays engine snapshots directly; engine attaches git/PR/status.

type Client = { ws: WebSocket; subs: Set<string> };

export class SyncServer {
  private options: Required<SyncServerOptions>;
  private httpServer?: http.Server;
  private wss?: WebSocketServer;
  private clients: Set<Client> = new Set();
  private version = 1;
  private timer?: NodeJS.Timeout;
  private gitTimer?: NodeJS.Timeout;
  private watcher?: chokidar.FSWatcher;
  private immediatePushTimer?: NodeJS.Timeout;
  private engine!: DevTeamEngine;
  // No separate git cache here; engine is source of truth

  constructor(opts: SyncServerOptions = {}) {
    this.options = {
      host: opts.host ?? '127.0.0.1',
      port: opts.port ?? 8787,
      path: opts.path ?? '/sync',
      refreshIntervalMs: opts.refreshIntervalMs ?? 5000,
      gitRefreshIntervalMs: opts.gitRefreshIntervalMs ?? 15000,
    };
  }

  async start(): Promise<{host: string; port: number; path: string}> {
    if (this.httpServer) throw new Error('SyncServer already started');
    this.httpServer = http.createServer();
    await new Promise<void>((resolve) => this.httpServer!.listen(this.options.port, this.options.host, resolve));
    this.wss = new WebSocketServer({server: this.httpServer, path: this.options.path});
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    // Engine provides snapshots when changed; we still tick to refresh tmux/AI state
    const projectsDir = getProjectsDirectory();
    this.engine = new DevTeamEngine({projectsDir});
    this.engine.on('snapshot', (snap) => this.broadcastSnapshot(snap));
    await (this.engine as any).refreshProgressive?.() || this.engine.refreshNow();
    this.timer = setInterval(() => { void ((this.engine as any).refreshProgressive?.() || this.engine.refreshNow()); }, this.options.refreshIntervalMs);
    // Engine handles git/PR/status refresh; no separate server timers
    this.setupWatchers();
    return {host: this.options.host, port: this.options.port, path: this.options.path};
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.gitTimer) clearInterval(this.gitTimer);
    const closeWss = this.wss ? new Promise<void>((r) => this.wss!.close(() => r())) : Promise.resolve();
    const closeHttp = this.httpServer ? new Promise<void>((r) => this.httpServer!.close(() => r())) : Promise.resolve();
    try { await this.watcher?.close(); } catch {}
    this.clients.clear();
    await Promise.all([closeWss, closeHttp]);
    this.wss = undefined;
    this.httpServer = undefined;
  }

  private async handleConnection(ws: WebSocket, req: http.IncomingMessage) {
    const url = req.url || '';
    const {pathname} = parseUrl(url, true);
    if (pathname !== this.options.path) return ws.close(1008, 'Invalid path');

    const client: Client = {ws, subs: new Set()};
    this.clients.add(client);

    const send = (msg: ServerToClient) => {
      try { ws.send(JSON.stringify(msg)); } catch {}
    };

    const snap = this.engine.getSnapshot();
    this.version = snap.version;
    send({type: 'ready', version: this.version, ts: Date.now()});

    ws.on('message', async (raw: WebSocket.RawData) => {
      let msg: ClientToServer | null = null;
      try { msg = JSON.parse(raw.toString()); } catch {}
      if (!msg) return;

      if (msg.type === 'hello') {
        const subs = new Set(msg.subs || []);
        client.subs = subs;
        if (subs.has('worktrees')) {
          // Send current snapshot
          await this.sendWorktreesSnapshot(client);
      }
      } else if (msg.type === 'get.worktrees') {
        await this.sendWorktreesSnapshot(client);
      }
    });

    ws.on('close', () => {
      this.clients.delete(client);
    });
  }

  private async sendWorktreesSnapshot(client: Client) {
    const snap = this.engine.getSnapshot();
    this.version = snap.version;
    const msg: ServerToClient = {type: 'worktrees.snapshot', version: snap.version, items: snap.items};
    try { client.ws.send(JSON.stringify(msg)); } catch {}
  }

  private async pushWorktreesToSubscribers() {
    // Kept for safety; engine emits snapshots on change and will broadcast via handler
    await this.engine.refreshNow();
  }

  private broadcastSnapshot(snap: {version: number; items: any[]}) {
    this.version = snap.version;
    const subs = [...this.clients].filter(c => c.subs.has('worktrees'));
    if (subs.length === 0) return;
    const text = JSON.stringify({type: 'worktrees.snapshot', version: snap.version, items: snap.items});
    for (const c of subs) {
      try { c.ws.send(text); } catch {}
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
