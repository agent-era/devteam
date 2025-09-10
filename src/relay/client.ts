import WS from 'isomorphic-ws';
import {RelayClientOptions, IWebSocketLike, RelayMessage} from './types.js';

function buildQuery(params: Record<string, string | undefined>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) usp.set(k, v);
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export type RelayClientEvents = {
  open: () => void;
  close: (code?: number, reason?: string) => void;
  error: (err: any) => void;
  message: (data: ArrayBuffer | Uint8Array | string | Buffer) => void;
  reconnect: (attempt: number, delayMs: number) => void;
};

type InternalClientOptions = {
  url: string;
  roomId: string;
  clientId?: string;
  token?: string;
  reconnect: boolean;
  maxReconnectDelayMs: number;
  heartbeatIntervalMs: number;
};

export class RelayClient {
  private opts: InternalClientOptions;
  private ws?: IWebSocketLike;
  private seq = 0;
  private closed = false;
  private reconnectAttempt = 0;
  private heartbeatTimer?: any;
  private listeners: Partial<RelayClientEvents> = {};

  constructor(options: RelayClientOptions) {
    this.opts = {
      url: options.url,
      roomId: options.roomId,
      clientId: options.clientId,
      token: options.token,
      reconnect: options.reconnect ?? true,
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? 15000,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 15000,
    };
  }

  on<K extends keyof RelayClientEvents>(event: K, fn: RelayClientEvents[K]) {
    // @ts-ignore
    this.listeners[event] = fn;
    return this;
  }

  private emit<K extends keyof RelayClientEvents>(event: K, ...args: Parameters<RelayClientEvents[K]>) {
    const fn = this.listeners[event] as any;
    if (fn) try { fn(...args as any); } catch {}
  }

  connect() {
    this.closed = false;
    this.reconnectAttempt = 0;
    this.openSocket();
  }

  private openSocket() {
    const q = buildQuery({room: this.opts.roomId, clientId: this.opts.clientId, token: this.opts.token});
    const url = `${this.opts.url}${q}`;
    const ws = new WS(url);
    ws.binaryType = 'arraybuffer' as any;
    this.ws = ws as any;

    ws.onopen = () => {
      this.emit('open');
      this.reconnectAttempt = 0;
      this.startHeartbeat();
    };
    ws.onclose = (ev: any) => {
      this.stopHeartbeat();
      this.emit('close', ev?.code, ev?.reason);
      this.ws = undefined;
      if (!this.closed && this.opts.reconnect) this.scheduleReconnect();
    };
    ws.onerror = (err: any) => this.emit('error', err);
    ws.onmessage = (ev: any) => {
      const data = ev?.data;
      this.emit('message', data);
    };
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        // isomorphic-ws client exposes .ping only in Node; in browser there is no ping API.
        // We send a small text frame as heartbeat when ping is unavailable.
        const anyWs: any = this.ws;
        if (!anyWs) return;
        if (typeof anyWs.ping === 'function') anyWs.ping();
        else anyWs.send("\u200b"); // zero-width space
      } catch {}
    }, this.opts.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleReconnect() {
    this.reconnectAttempt += 1;
    const base = Math.min(this.opts.maxReconnectDelayMs, 250 * Math.pow(2, this.reconnectAttempt));
    const jitter = Math.floor(Math.random() * 300);
    const delay = base + jitter;
    this.emit('reconnect', this.reconnectAttempt, delay);
    setTimeout(() => {
      if (!this.closed) this.openSocket();
    }, delay);
  }

  send(data: RelayMessage) {
    if (!this.ws || (this.ws as any).readyState !== (WS as any).OPEN) return false;
    try {
      (this.ws as any).send(data);
      this.seq += 1;
      return true;
    } catch {
      return false;
    }
  }

  close(code?: number, reason?: string) {
    this.closed = true;
    this.stopHeartbeat();
    try { this.ws?.close(code, reason); } catch {}
  }
}

export function buildRelayUrl(baseUrl: string, roomId: string, clientId?: string, token?: string) {
  const usp = new URLSearchParams();
  usp.set('room', roomId);
  if (clientId) usp.set('clientId', clientId);
  if (token) usp.set('token', token);
  return `${baseUrl}?${usp.toString()}`;
}
