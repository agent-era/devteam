#!/usr/bin/env node
import {createSyncServer} from '../sync/server.js';

const postUrl = String(process.env.SYNC_POST_URL || 'http://127.0.0.1:3000/api/snapshots/push');

async function main() {
  const srv = createSyncServer({postUrl});
  const info = await srv.start();
  // eslint-disable-next-line no-console
  console.error(`DevTeam sync agent posting to ${info.postUrl}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start DevTeam sync agent:', err);
  process.exit(1);
});
