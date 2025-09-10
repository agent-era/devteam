import WS from 'isomorphic-ws';
import type {SyncClientOptions, ServerToClient, WorktreeSummary} from './types.js';

type Events = {
  open: () => void;
  close: (code?: number, reason?: string) => void;
  error: (err: any) => void;
  worktrees: (items: WorktreeSummary[], version: number) => void;
};

export class SyncClient {
  private url: string;
  private autoSubscribe: boolean;
  private ws?: any;
  private listeners: Partial<Events> = {};

  constructor(opts: SyncClientOptions) {
    this.url = opts.url;
    this.autoSubscribe = !!opts.autoSubscribe;
  }

  on<K extends keyof Events>(event: K, fn: Events[K]) {
    // @ts-ignore
    this.listeners[event] = fn;
    return this;
  }

  private emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
    const fn = this.listeners[event] as any;
    if (fn) try { fn(...args); } catch {}
  }

  connect() {
    const ws = new WS(this.url);
    ws.onopen = () => {
      this.emit('open');
      if (this.autoSubscribe) {
        try { ws.send(JSON.stringify({type: 'hello', subs: ['worktrees']})); } catch {}
      }
    };
    ws.onclose = (ev: any) => this.emit('close', ev?.code, ev?.reason);
    ws.onerror = (err: any) => this.emit('error', err);
    ws.onmessage = (ev: any) => this.handleMessage(ev?.data);
    this.ws = ws;
  }

  close() { try { this.ws?.close(); } catch {} }

  requestWorktrees() {
    try { this.ws?.send(JSON.stringify({type: 'get.worktrees'})); } catch {}
  }

  private handleMessage(data: any) {
    let msg: ServerToClient | null = null;
    try { msg = JSON.parse(typeof data === 'string' ? data : data?.toString?.() ?? ''); } catch {}
    if (!msg) return;
    if (msg.type === 'worktrees.snapshot') {
      this.emit('worktrees', msg.items, msg.version);
    }
  }
}

