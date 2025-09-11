#!/usr/bin/env node
import {createSyncServer} from '../sync/server.js';

const postUrl = String(process.env.SYNC_POST_URL || process.env.WEB_URL || 'http://127.0.0.1:3000/api/snapshots/push');
const refresh = Number(process.env.SYNC_REFRESH_MS || 30000);

async function main() {
  const srv = createSyncServer({postUrl, refreshIntervalMs: refresh});
  const info = await srv.start();
  // eslint-disable-next-line no-console
  console.error(`DevTeam sync agent posting to ${info.postUrl}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start DevTeam sync agent:', err);
  process.exit(1);
});
