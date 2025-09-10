#!/usr/bin/env node
import {createSyncServer} from '../sync/server.js';

const port = Number(process.env.SYNC_PORT || 8787);
const host = String(process.env.SYNC_HOST || '127.0.0.1');
const path = String(process.env.SYNC_PATH || '/sync');
const refresh = Number(process.env.SYNC_REFRESH_MS || 30000);

async function main() {
  const srv = createSyncServer({port, host, path, refreshIntervalMs: refresh});
  const info = await srv.start();
  // eslint-disable-next-line no-console
  console.error(`DevTeam Sync server on ws://${info.host}:${info.port}${info.path}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start DevTeam Sync server:', err);
  process.exit(1);
});

