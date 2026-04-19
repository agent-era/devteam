# Testing

See [`docs/architecture/testing-strategy.md`](../docs/architecture/testing-strategy.md) for the full testing philosophy and layer overview.

## Quick reference

```bash
npm test                  # unit + E2E (Jest)
npm run test:watch        # Jest watch mode
npm run typecheck         # TypeScript only
npm run test:terminal     # terminal rendering (Node runner, builds first)
```

## Test layers

### Unit tests (`tests/unit/`)

Test Core engines and services in isolation using fake implementations.

### E2E tests (`tests/e2e/`)

Full user workflows. The real app renders with fake services (no git/tmux/GitHub). Tests interact via `stdin` writes and assert on rendered output using `tests/utils/renderApp.tsx`.

### Terminal tests (`tests/e2e/terminal/`)

Node scripts (not Jest) that render real Ink components in a real TTY. These exist because Jest's TTY/raw-mode handling is unreliable for Ink. Scripts import from `dist/` and `dist-tests/` — `npm run test:terminal` compiles both before running.

## Fake services

Fakes live in `tests/fakes/`. Each implements the same interface as its real counterpart but operates on shared in-memory stores (`tests/fakes/stores.ts`).

| Fake | Replaces |
|------|---------|
| `FakeGitService` | `GitService` |
| `FakeTmuxService` | `TmuxService` |

Reset stores between tests:
```typescript
beforeEach(() => resetTestData());
```

## Philosophy

- Mock only at the external boundary (git, tmux, gh CLI).
- Run real app logic and real React components.
- Test through keyboard interactions, not internal implementation details.
