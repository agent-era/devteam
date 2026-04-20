---
title: it still comes back to main screen instead of kanban board from some places. it should come back to the place that launched it
slug: return-to-launcher-screen
updated: 2026-04-20
---

## Problem

When the user launches something from the kanban (tracker) board, some actions route back to the worktree list ("main screen") on close instead of back to the tracker. The board already wires `onReturn: backToTracker` for the flows that have explicit return support (attach / shell / run / diff / archive — see `src/screens/TrackerBoardScreen.tsx:196-242`), but other screens launched from the board have no such return hook and unconditionally call `showList` when they close.

Concrete gaps in the current code:

- **Settings (`c` from tracker)** — `TrackerBoardScreen` binds `onSettings: () => showSettings(project)` (TrackerBoardScreen.tsx:322), but `App.tsx:491` renders `<SettingsDialog … onCancel={showList} />`. There is no `settingsReturn` state in `UIContext` analogous to `archiveReturn` / `diffReturn` / `pendingWorktreeReturn`, so closing Settings always drops the user on the worktree list, even when they came from the tracker.
- **Info dialogs** — `showInfo` (UIContext.tsx:211) always closes via `showList` (App.tsx:430). Currently `showInfo` is only invoked from `WorktreeListScreen` / `CreateFeatureScreen`, so it's not yet user-visible in the tracker flow; but the same missing-return problem exists and will bite as soon as any tracker-side flow uses it.

Help (`?`) is not currently bound on the tracker, so it's not a gap today.

## Why

Mixing return destinations breaks the mental model the rest of the board already establishes: every other action launched from the tracker (attach, shell, run, diff, archive) returns to the tracker on close. Settings is the odd one out, so users lose their place mid-task and have to press `t` to get back to the board they were just on. The existing `*Return` callback pattern in `UIContext` is exactly the mechanism for this; Settings and Info just weren't plumbed through. Closing the gap is a small, symmetric extension of an already-proven pattern.

## User stories

- As a user working in the kanban board, when I open Settings with `c` and cancel, I want to land back on the kanban board I launched from — not on the worktree list — so I don't lose my place.
- As a future contributor adding a new tracker-side flow that surfaces an info dialog, I want `showInfo` to already support an `onReturn` callback so I don't have to re-plumb this pattern myself.

## Summary

Extend the existing launcher-return callback pattern in `UIContext` to cover `showSettings` and `showInfo`, mirroring what's already done for archive / diff / AI-tool selection. `TrackerBoardScreen` passes `onReturn: backToTracker` when opening Settings, and the Settings/Info close handlers fall back to `showList` only when no return callback was provided. `resetUIState` is extended to clear the new `settingsReturn` / `infoReturn` slots alongside the existing ones. No new UI surface; the fix is purely in the navigation plumbing.

## Acceptance criteria

1. `UIContext` exposes a `settingsReturn: (() => void) | null` slot and `showSettings(project, options?: {onReturn?: () => void})` stores it. Same shape as `archiveReturn` / `showArchiveConfirmation`.
2. `UIContext` exposes an `infoReturn: (() => void) | null` slot and `showInfo(message, options?: {title?; onClose?; onReturn?})` stores it. `onClose` keeps its current semantics (runs before navigation); `onReturn` replaces the hardcoded `showList` destination when provided.
3. `resetUIState` clears both new `*Return` slots (same place the other three are cleared).
4. `App.tsx` Settings route uses `settingsReturn ?? showList` for the dialog's cancel handler. The Info route uses `infoReturn ?? showList` as the post-`onClose` destination.
5. `TrackerBoardScreen` passes `onReturn: backToTracker` when calling `showSettings(project, …)`. No other call sites change behavior (they pass no `onReturn` and continue to fall back to `showList`).
6. Pressing `c` on the tracker board, then pressing Escape in the Settings dialog, leaves the app in `mode === 'tracker'` with the same `trackerProject` as before — not `mode === 'list'`. Verified by a test (unit against `UIContext` state transitions or an E2E that drives the keypresses, matching the style of existing archive/diff coverage).
7. Opening Settings from the worktree list (the existing path) still returns to the list on cancel — the fallback path is unchanged. Covered by existing behavior / test.
8. `npm run typecheck` and `npm test` pass. New tests are added for the tracker → Settings → cancel → tracker flow.

## Out of scope

- Routing the tracker's `x` (execute-run) key to Settings when `attachRunSession` returns `'no_config'`. This is a separate behavior gap (TrackerBoardScreen.tsx:216-221 doesn't inspect the result the way `App.handleExecuteRun` does) and is tracked outside this item to keep the change focused on return-path plumbing.
- Adding `onHelp` to the tracker's keyboard shortcuts. Help isn't currently reachable from the board, so there's nothing to fix here today.
