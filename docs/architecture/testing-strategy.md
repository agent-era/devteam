# Testing Strategy

## Three test layers

### 1. Unit tests (`tests/unit/`)

Test services and Core engines in isolation with fake implementations.

```typescript
test('creates worktree', async () => {
  const git = new FakeGitService();
  const core = new WorktreeCore({ gitService: git });
  await core.createFeature('myproject', 'my-feature');
  expect(git.store.worktrees).toHaveLength(1);
});
```

Fakes live in `tests/fakes/`. Each fake implements the same interface as its real counterpart but operates on in-memory stores (`tests/fakes/stores.ts`).

### 2. E2E tests (`tests/e2e/`)

Full user workflows using `tests/utils/renderApp.tsx`. The app renders with real React/Ink but uses fake services instead of real git/tmux/GitHub. Tests interact via `stdin` writes and assert on rendered output.

```typescript
const { lastFrame, stdin } = renderApp({ fakeGit, fakeTmux });
stdin.write('n');           // open create dialog
await delay(100);
stdin.write('\r');          // select project
expect(lastFrame()).toContain('my-feature');
```

This layer catches cross-component bugs that unit tests miss while remaining fast and deterministic.

### 3. Terminal tests (`tests/e2e/terminal/`)

Node scripts (not Jest) that render real Ink components in a real TTY to verify terminal output. These exist because Jest's TTY/raw-mode handling is unreliable for Ink.

Scripts import from `dist/` and `dist-tests/`; run `npm run test:terminal` which compiles both before executing.

Current scripts:
- `run-smoke.mjs` — Ink `<Text>` renders
- `run-mainview-list.mjs` — main list rows appear
- `run-app-full.mjs` — full app with providers renders

### Running tests

```bash
npm test                  # unit + E2E (Jest)
npm run test:watch        # Jest watch
npm run typecheck         # TypeScript only
npm run test:terminal     # terminal rendering (Node runner)
```

## Fake service design

Fakes use shared in-memory `stores.ts` objects so multiple fakes can observe the same state (e.g., `FakeGitService` and `FakeWorktreeService` share the same worktree store). This keeps E2E tests coherent without real filesystem operations.

## Philosophy

- Mock only at the external boundary (git, tmux, gh CLI).
- Run real app logic and real React components in tests.
- Test through user interactions (keyboard input), not internal implementation.
- Prefer E2E tests for cross-service flows; unit tests for edge cases in a single service.
