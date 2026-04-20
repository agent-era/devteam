# Discovery — return-to-launcher-screen

## User problem

When the user launches something from the kanban (tracker) board, some actions route back to the worktree list ("main screen") on close instead of back to the tracker. The board already wires `onReturn: backToTracker` for the flows that have explicit return support (attach / shell / run / diff / archive — see `src/screens/TrackerBoardScreen.tsx:196-242`), but other screens launched from the board have no such return hook and unconditionally call `showList` when they close.

Concrete gaps in the current code:

- **Settings (`c` from tracker)** — `TrackerBoardScreen` binds `onSettings: () => showSettings(project)` (TrackerBoardScreen.tsx:322), but `App.tsx:491` renders `<SettingsDialog … onCancel={showList} />`. There is no `settingsReturn` state in `UIContext` analogous to `archiveReturn` / `diffReturn` / `pendingWorktreeReturn`, so closing Settings always drops the user on the worktree list, even when they came from the tracker.
- **Info dialogs** — `showInfo` (UIContext.tsx:211) always closes via `showList` (App.tsx:430). Currently `showInfo` is only invoked from `WorktreeListScreen` / `CreateFeatureScreen`, so it's not yet user-visible in the tracker flow; but the same missing-return problem exists and will bite as soon as any tracker-side flow uses it.
- **Tracker's own execute-run (`x`)** silently no-ops on `no_config` instead of routing to Settings, because `TrackerBoardScreen.handleExecuteRun` (TrackerBoardScreen.tsx:216-221) doesn't inspect the `attachRunSession` result the way `App.handleExecuteRun` does (App.tsx:187-199). If we fix Settings to return to the launcher, we should also have the kanban's run flow open Settings-with-return-to-tracker when there's no config, matching the list's behavior.

Help (`?`) is not currently bound on the tracker, so it's not a gap today.

## Recommendation

Extend the existing launcher-return callback pattern to `showSettings`, and pass `onReturn: backToTracker` from `TrackerBoardScreen.onSettings`. Minimal, symmetric with the existing `archiveReturn` / `diffReturn` / `pendingWorktreeReturn` wiring:

1. Add `settingsReturn: (() => void) | null` state + setter in `UIContext` and accept an `options?: {onReturn?: () => void}` on `showSettings`, mirroring `showArchiveConfirmation`.
2. In `App.tsx`, render `<SettingsDialog onCancel={settingsReturn ?? showList} />`. Clear `settingsReturn` in `resetUIState` (already wipes the other `*Return` slots).
3. In `TrackerBoardScreen`, change `onSettings` to `() => showSettings(project, {onReturn: backToTracker})`.
4. While here, make the kanban's `x` (execute run) match the list's behavior: if `attachRunSession` returns `'no_config'`, open Settings with `onReturn: backToTracker` instead of silently dropping the user. This is the smallest change that keeps the board's run key useful.
5. Do the same `onReturn` plumbing for `showInfo` so that any future tracker-side flow that surfaces an info dialog returns to the board. Optional but cheap and prevents the same bug from reappearing.

Tests: add a small unit/E2E check that pressing `c` on the tracker board and then cancelling Settings leaves `mode === 'tracker'` (not `'list'`). Archive/diff already have analogous coverage to copy from.
