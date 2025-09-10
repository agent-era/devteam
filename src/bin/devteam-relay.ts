#!/usr/bin/env node
import {createRelayServer} from '../relay/server.js';

const port = Number(process.env.PORT || 8080);
const host = String(process.env.HOST || '0.0.0.0');
const path = String(process.env.PATHNAME || '/relay');

async function main() {
  const relay = createRelayServer({port, host, path});
  const info = await relay.start();
  // eslint-disable-next-line no-console
  console.error(`DevTeam Relay listening on ws://${info.host}:${info.port}${info.path}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start relay:', err);
  process.exit(1);
});

