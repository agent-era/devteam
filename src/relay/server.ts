import http from 'node:http';
import {WebSocketServer, WebSocket} from 'ws';
import {parse as parseUrl} from 'node:url';
import {randomUUID} from 'node:crypto';
import {RelayServerOptions, RelayServerInfo} from './types.js';

type Client = {
  id: string;
  ws: WebSocket;
  room: string;
  lastPong: number;
};

export class RelayServer {
  private options: Required<RelayServerOptions>;
  private httpServer?: http.Server;
  private wss?: WebSocketServer;
  private rooms: Map<string, Map<string, Client>> = new Map();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(opts: RelayServerOptions = {}) {
    this.options = {
      port: opts.port ?? 8080,
      host: opts.host ?? '0.0.0.0',
      path: opts.path ?? '/relay',
      maxClientsPerRoom: opts.maxClientsPerRoom ?? 100,
      heartbeatIntervalMs: opts.heartbeatIntervalMs ?? 15000,
      tokenValidator: opts.tokenValidator ?? (async () => true),
    };
  }

  async start(): Promise<RelayServerInfo> {
    if (this.httpServer) throw new Error('RelayServer already started');

    this.httpServer = http.createServer();
    await new Promise<void>((resolve) => this.httpServer!.listen(this.options.port, this.options.host, resolve));

    this.wss = new WebSocketServer({server: this.httpServer, path: this.options.path});
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.options.heartbeatIntervalMs);

    return {port: this.options.port, host: this.options.host, path: this.options.path};
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    const closeWss = this.wss ? new Promise<void>((r) => this.wss!.close(() => r())) : Promise.resolve();
    const closeHttp = this.httpServer ? new Promise<void>((r) => this.httpServer!.close(() => r())) : Promise.resolve();
    await Promise.all([closeWss, closeHttp]);
    this.wss = undefined;
    this.httpServer = undefined;
    this.rooms.clear();
  }

  private async handleConnection(ws: WebSocket, req: http.IncomingMessage) {
    try {
      const url = req.url || '';
      const parsed = parseUrl(url, true);
      const {query, pathname} = parsed;
      if (pathname !== this.options.path) return ws.close(1008, 'Invalid path');

      const room = String(query.room || '').trim();
      const clientId = String(query.clientId || '').trim() || randomUUID();
      const token = typeof query.token === 'string' ? query.token : undefined;

      if (!room) return ws.close(1008, 'Missing room');
      const ok = await this.options.tokenValidator(token, room, clientId);
      if (!ok) return ws.close(1008, 'Unauthorized');

      const roomMap = this.rooms.get(room) || new Map<string, Client>();
      if (!this.rooms.has(room)) this.rooms.set(room, roomMap);
      if (roomMap.size >= this.options.maxClientsPerRoom) return ws.close(1013, 'Room full');

      const client: Client = {id: clientId, ws, room, lastPong: Date.now()};
      roomMap.set(clientId, client);

      ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        // Broadcast to others in the same room, payload is opaque
        for (const [otherId, other] of roomMap.entries()) {
          if (otherId === clientId) continue;
          try {
            other.ws.send(data, {binary: isBinary});
          } catch {
            // ignore send errors
          }
        }
      });

      ws.on('pong', () => {
        client.lastPong = Date.now();
      });

      ws.on('close', () => {
        roomMap.delete(clientId);
        if (roomMap.size === 0) this.rooms.delete(room);
      });

    } catch {
      try { ws.close(); } catch {}
    }
  }

  private heartbeat() {
    const now = Date.now();
    for (const [roomId, roomMap] of this.rooms.entries()) {
      for (const [clientId, client] of roomMap.entries()) {
        const ws = client.ws;
        if (ws.readyState !== WebSocket.OPEN) {
          roomMap.delete(clientId);
          continue;
        }
        if (now - client.lastPong > this.options.heartbeatIntervalMs * 2.5) {
          try { ws.terminate(); } catch {}
          roomMap.delete(clientId);
          continue;
        }
        try { ws.ping(); } catch {}
      }
      if (roomMap.size === 0) this.rooms.delete(roomId);
    }
  }
}

export function createRelayServer(options: RelayServerOptions = {}) {
  return new RelayServer(options);
}
