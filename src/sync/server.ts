import http from 'node:http';
import {WebSocketServer, WebSocket} from 'ws';
import {parse as parseUrl} from 'node:url';
import chokidar from 'chokidar';
import {getProjectsDirectory} from '../config.js';
import {GitService} from '../services/GitService.js';
import {TmuxService} from '../services/TmuxService.js';
import type {ClientToServer, ServerToClient, SyncServerOptions, WorktreeSummary} from './types.js';
import {createHash} from 'node:crypto';

type Client = { ws: WebSocket; subs: Set<string> };

export class SyncServer {
  private options: Required<SyncServerOptions>;
  private httpServer?: http.Server;
  private wss?: WebSocketServer;
  private clients: Set<Client> = new Set();
  private version = 1;
  private timer?: NodeJS.Timeout;
  private watcher?: chokidar.FSWatcher;
  private immediatePushTimer?: NodeJS.Timeout;
  private lastSnapshot: WorktreeSummary[] | null = null;
  private lastHash: string | null = null;

  constructor(opts: SyncServerOptions = {}) {
    this.options = {
      host: opts.host ?? '127.0.0.1',
      port: opts.port ?? 8787,
      path: opts.path ?? '/sync',
      refreshIntervalMs: opts.refreshIntervalMs ?? 5000,
    };
  }

  async start(): Promise<{host: string; port: number; path: string}> {
    if (this.httpServer) throw new Error('SyncServer already started');
    this.httpServer = http.createServer();
    await new Promise<void>((resolve) => this.httpServer!.listen(this.options.port, this.options.host, resolve));
    this.wss = new WebSocketServer({server: this.httpServer, path: this.options.path});
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.timer = setInterval(() => void this.pushWorktreesToSubscribers().catch(() => {}), this.options.refreshIntervalMs);
    this.setupWatchers();
    return {host: this.options.host, port: this.options.port, path: this.options.path};
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
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

    send({type: 'ready', version: this.version, ts: Date.now()});

    ws.on('message', async (raw: WebSocket.RawData) => {
      let msg: ClientToServer | null = null;
      try { msg = JSON.parse(raw.toString()); } catch {}
      if (!msg) return;

      if (msg.type === 'hello') {
        const subs = new Set(msg.subs || []);
        client.subs = subs;
        if (subs.has('worktrees')) await this.sendWorktreesSnapshot(client);
      } else if (msg.type === 'get.worktrees') {
        await this.sendWorktreesSnapshot(client);
      }
    });

    ws.on('close', () => {
      this.clients.delete(client);
    });
  }

  private async collectWorktrees(): Promise<WorktreeSummary[]> {
    const base = getProjectsDirectory();
    const git = new GitService(base);
    const tmux = new TmuxService();
    const projects = git.discoverProjects();
    const items: WorktreeSummary[] = [];
    let activeSessions: string[] = [];
    try { activeSessions = await tmux.listSessions(); } catch { activeSessions = []; }
    for (const project of projects) {
      try {
        const wts = await git.getWorktreesForProject(project);
        for (const wt of wts) {
          const session = tmux.sessionName(wt.project, wt.feature);
          const attached = activeSessions.includes(session);
          let ai_tool: string | undefined = undefined;
          let ai_status: string | undefined = undefined;
          if (attached) {
            try {
              const res = await tmux.getAIStatus(session);
              ai_tool = res.tool;
              ai_status = res.status;
            } catch {}
          }
          items.push({
            project: wt.project,
            feature: wt.feature,
            path: wt.path,
            branch: wt.branch,
            session,
            attached,
            ai_tool,
            ai_status,
          });
        }
      } catch {}
    }
    items.sort((a, b) => (a.project === b.project) ? a.feature.localeCompare(b.feature) : a.project.localeCompare(b.project));
    return items;
  }

  private async sendWorktreesSnapshot(client: Client) {
    if (!this.lastSnapshot) {
      await this.refreshSnapshotIfChanged(true);
    }
    const msg: ServerToClient = {type: 'worktrees.snapshot', version: this.version, items: this.lastSnapshot || []};
    try { client.ws.send(JSON.stringify(msg)); } catch {}
  }

  private async pushWorktreesToSubscribers() {
    const subs = [...this.clients].filter(c => c.subs.has('worktrees'));
    if (subs.length === 0) return;
    const changed = await this.refreshSnapshotIfChanged(false);
    if (!changed) return;
    const msg: ServerToClient = {type: 'worktrees.snapshot', version: this.version, items: this.lastSnapshot || []};
    const text = JSON.stringify(msg);
    for (const c of subs) {
      try { c.ws.send(text); } catch {}
    }
  }

  private async refreshSnapshotIfChanged(force: boolean): Promise<boolean> {
    const items = await this.collectWorktrees();
    const hash = this.hashItems(items);
    if (this.lastHash !== hash || force || !this.lastSnapshot) {
      this.lastSnapshot = items;
      this.lastHash = hash;
      this.version += 1;
      return true;
    }
    return false;
  }

  private hashItems(items: WorktreeSummary[]): string {
    const json = JSON.stringify(items);
    return createHash('sha1').update(json).digest('hex');
  }

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
      const subs = [...this.clients].filter(c => c.subs.has('worktrees'));
      if (subs.length === 0) return;
      const changed = await this.refreshSnapshotIfChanged(true);
      if (!changed) return;
      const msg: ServerToClient = {type: 'worktrees.snapshot', version: this.version, items: this.lastSnapshot || []};
      const text = JSON.stringify(msg);
      for (const c of subs) {
        try { c.ws.send(text); } catch {}
      }
    }, 250); // debounce bursts
  }
}

export function createSyncServer(options: SyncServerOptions = {}) {
  return new SyncServer(options);
}
