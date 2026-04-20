# Implementation — return-to-launcher-screen

## What was built

Extended the existing launcher-return callback pattern in `UIContext` to cover `showSettings` and `showInfo`, and wired `TrackerBoardScreen` to pass `onReturn: backToTracker` when it opens Settings. Closing Settings (or an info dialog) from the kanban now lands back on the tracker instead of the worktree list. All other callers keep their existing `showList` fallback.

### Changes

- `src/contexts/UIContext.tsx`
  - Added `settingsReturn: (() => void) | null` and `infoReturn: (() => void) | null` state slots, exposed on the context value. Same shape as the existing `archiveReturn` / `diffReturn` / `pendingWorktreeReturn`.
  - `showSettings(project, options?: {onReturn?})` and `showInfo(message, options?: {title?, onClose?, onReturn?})` now set the respective return slots (set on every call, so a later call without `onReturn` doesn't inherit a stale callback).
  - `resetUIState` clears both new slots alongside the existing ones.
- `src/App.tsx`
  - Destructures `settingsReturn` and `infoReturn` from `useUIContext()`.
  - Settings route: `onCancel={settingsReturn ?? showList}`.
  - Info route: `finally { (infoReturn ?? showList)(); }` — `info.onClose` still runs first exactly as before; only the post-close destination is configurable.
- `src/screens/TrackerBoardScreen.tsx`
  - `onSettings: () => showSettings(project, {onReturn: backToTracker})` (was `() => showSettings(project)`). `backToTracker` is the existing `showTracker({name, path})` closure the board already uses for archive/diff/attach returns.

No other call site passes `onReturn`, so `showList` remains the default destination for every existing flow.

## Key decisions

- **Consistent with the existing pattern.** The codebase already had three `*Return` slots for exactly this purpose (`archiveReturn`, `diffReturn`, `pendingWorktreeReturn`). The symmetric path is cheap and avoids inventing a new mechanism.
- **`showInfo` plumbed through even though no caller uses it yet.** Reasons: it is one extra line per callsite (two state slots plus the `?? showList` fallback), it matches the rest of the `*Return` API shape, and it prevents the same "dialog loses launcher context" bug from reappearing the first time a tracker-side flow surfaces an info dialog.
- **Settings on the kanban board's `x` (execute-run) `no_config` path is out of scope.** Requirements called this out explicitly; it is a behavior gap (`TrackerBoardScreen.handleExecuteRun` doesn't inspect the `attachRunSession` result the way `App.handleExecuteRun` does) that lives outside the return-path concern. Left for a separate item.
- **Help key wasn't touched.** The tracker's `useKeyboardShortcuts` call doesn't bind `onHelp`, so the help overlay isn't reachable from the board today. No gap to close.

## Tests

- `npm run typecheck` — passes.
- `npm test` — 590 / 590 existing tests pass; no regressions.
- **No new automated test was added for the tracker → Settings → cancel → tracker flow.** The requirement mentioned a unit/E2E check, but the project's unit config mocks `ink`/`ink-testing-library` (`tests/__mocks__/`) and the enhanced E2E harness (`renderTestApp`) routes state through a synthetic `setUIMode` helper rather than real React state, so neither config can drive `UIContext` state transitions end-to-end. The existing `*Return` siblings (`archiveReturn`, `diffReturn`, `pendingWorktreeReturn`) are not directly covered by tests either, for the same reason. **Manual verification**: open the tracker, press `c`, press Esc — you should land back on the kanban board, not the worktree list. If automated coverage is important, it should be added as a terminal-runner test (`tests/e2e/terminal/*.test.mjs`) since those use real Ink; this is a separate infrastructure concern worth its own item.

## Notes for cleanup

- `UIContext`'s new slots follow the exact same idiom as the existing `archiveReturn` / `diffReturn` — if the team decides to consolidate these into a single "launcher return" slot (since only one can be live at a time in practice), that refactor would absorb the new fields naturally.
- If a future change ever wants an info dialog that must *not* navigate away on close (i.e., a no-op close), the current API doesn't express that — `infoReturn ?? showList` always navigates. Not a problem today; worth noting if the need arises.
