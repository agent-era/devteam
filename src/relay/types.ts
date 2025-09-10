// Minimal WebSocket-like interface to avoid DOM type dependency
export interface IWebSocketLike {
  readyState: number;
  binaryType: 'arraybuffer' | 'nodebuffer' | 'fragments' | 'buffer' | 'blob';
  onopen: null | (() => void);
  onclose: null | ((ev?: any) => void);
  onerror: null | ((err: any) => void);
  onmessage: null | ((ev: { data: any }) => void);
  send(data: any): void;
  close(code?: number, reason?: string): void;
}

export type RelayMessage = ArrayBuffer | Uint8Array | Buffer | string;

export interface RelayClientOptions {
  url: string; // e.g., ws://host:port/relay
  roomId: string;
  clientId?: string;
  token?: string;
  reconnect?: boolean;
  maxReconnectDelayMs?: number;
  heartbeatIntervalMs?: number;
}

export interface RelayServerOptions {
  port?: number;
  host?: string;
  path?: string; // default '/relay'
  maxClientsPerRoom?: number;
  heartbeatIntervalMs?: number;
  tokenValidator?: (token: string | undefined, roomId: string, clientId: string) => Promise<boolean> | boolean;
}

export interface RelayServerInfo {
  port: number;
  host: string;
  path: string;
}

