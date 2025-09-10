# DevTeam CLI (@agent-era/devteam)

Run a team of local coding agents in your terminal. Launch multiple Claude Code, Codex or Gemini agents, switch between them, review their changes and add comments, and push PRs  all from one streamlined terminal UI. An exercise to push how fast development can happen with multiple parallel agents. Mostly vibe-coded

![Screenshot](docs/screenshot.png)

## Install

Prerequisites: Node.js 18+ and tmux installed and on your PATH

Global install:

```
npm i -g @agent-era/devteam
```

This installs the `devteam` command.

Or run the provided installer script from a clone of this repo:

```
./install.sh
```

## Usage

Run the TUI in the top-level directory that you keep your git projects in:

```
cd ~/projects
devteam
```

Or point it at a directory explicitly:

```
devteam --dir /path/to/projects
# or
PROJECTS_DIR=/path/to/projects devteam
```
For best results:
- run in a VM and give your agents broad permissions within that sandbox
- give them a dedicated GitHub account that they can use to create PRs automatically
- add some guidelines in CLAUDE.md / AGENTS.md to add tests and make a PR for each feature

## Features

Use DevTeam to manage a team of agents working in parallel on your projects:

- Kick off multiple agents working on features in parallel (uses git worktrees)
- See their code changes with a built-in diff viewer, and add comments that are sent to them to address
- Agents asking for your input are highlighted in the UI so you can unblock them
- See how far each agent is: diff line counts, whether the feature is pushed, GitHub PR checks and status
- Run your program or server in each worktree so you can try out the changes easily.
- Choose Claude Code, Codex or Gemini CLI to work on each feature

## Repository

- GitHub: https://github.com/agent-era/devteam
- Issues: https://github.com/agent-era/devteam/issues

## Development

- Build: `npm run build`
- Run: `npm run cli -- --dir <path_to_projects_root>`
- Test: `npm test`
- Terminal E2E tests: `npm run test:terminal`

## Relay (Blind Broker)

This package ships a minimal WebSocket relay and a matching client that forward opaque frames by room. Use it to prototype the zero‑knowledge relay described in the Web UI + Remote Sync plan.

- Start the relay (default `ws://0.0.0.0:8080/relay`):

```
npx devteam-relay
# or, if installed globally: devteam-relay

# Env overrides:
PORT=9090 HOST=127.0.0.1 PATHNAME=/relay npx devteam-relay
```

- Use the client (Node or browser):

```ts
import {RelayClient} from '@agent-era/devteam/relay/client';

const client = new RelayClient({ url: 'ws://localhost:8080/relay', roomId: 'demo-room' });
client.on('open', () => console.log('connected'));
client.on('message', (data) => console.log('got', typeof data, data));
client.connect();
client.send('hello');
```

Notes
- Payloads are not inspected or stored.
- Token validation hook exists but currently accepts all tokens. Provide `tokenValidator` to enforce admission.
- Heartbeats and reconnects are built-in. E2E crypto and MsgPack framing can be layered on later.

## Sync Server (Local Mode)

For local development without a relay, a tiny WebSocket sync server exposes basic state. Right now it serves a worktree list snapshot and pushes periodic refreshes.

- Start the sync server:

```
PROJECTS_DIR=/path/to/projects npx devteam-server
# Defaults: ws://127.0.0.1:8787/sync
# Env overrides: SYNC_HOST, SYNC_PORT, SYNC_PATH, SYNC_REFRESH_MS
```

- Connect from Node or the browser:

```ts
import {SyncClient} from '@agent-era/devteam/sync';

const c = new SyncClient({url: 'ws://127.0.0.1:8787/sync', autoSubscribe: true});
c.on('worktrees', (items, version) => console.log(version, items));
c.connect();
```

## Using The Relay With Sync

In remote mode, there’s no inbound port. Both the agent and the browser connect out to the relay and exchange the same sync messages (later E2E‑encrypted + msgpack). Conceptually:

```ts
// Agent side (inside the DevTeam app):
import {RelayClient} from '@agent-era/devteam/relay/client';
const relay = new RelayClient({ url: 'wss://relay.example/relay', roomId: 'room-xyz' });
relay.on('open', async () => {
  // Build snapshot and send to all peers
  const items = await collectWorktrees();
  relay.send(JSON.stringify({ type: 'worktrees.snapshot', version: 1, items }));
});
relay.on('message', (data) => {
  // Handle commands from browser clients (e.g., create worktree)
});
relay.connect();

// Browser side:
import {RelayClient} from '@agent-era/devteam/relay/client';
const client = new RelayClient({ url: 'wss://relay.example/relay', roomId: 'room-xyz' });
client.on('message', (data) => {
  const msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer));
  if (msg.type === 'worktrees.snapshot') render(msg.items);
});
client.connect();
```

Notes
- Same message shapes as the local sync server; only the transport changes.
- In production, payloads are E2E‑encrypted and msgpack‑encoded; the relay carries opaque frames.

## Publishing (scoped public)

```
npm version <patch|minor|major>
npm publish --access public
```

Note: `prepublishOnly` runs the build to ensure `dist/` is included in the published tarball.

Convenience scripts:

```
npm run release:patch  # bump patch + publish
npm run release:minor  # bump minor + publish
npm run release:major  # bump major + publish
```
