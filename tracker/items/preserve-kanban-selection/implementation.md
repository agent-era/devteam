---
title: preserve-kanban-selection implementation
updated: 2026-04-20
---

## What was built

Three coordinated fixes for navigation / selection bugs on the kanban board:

### 1. `setLastTrackerProject()` confined to app launch
- Removed the call from `UIContext.showTracker()` (`src/contexts/UIContext.tsx`).
- Added a single call in `App.tsx`'s startup effect after resolving the initial project. Mid-session project switches no longer overwrite the persisted "last project".

### 2. Navigating to the tracker preserves the active project
- `handleTracker()` in `App.tsx` now early-returns `showTracker(trackerProject)` when a project is already active, instead of re-running `discoverProjects()` and falling back to `projects[0]`. The fallback path still runs on first entry to the tracker.
- `resetUIState()` in `UIContext` no longer clears `trackerProject`. Tracker-related screens all gate on `mode` too, so a non-null `trackerProject` while `mode='list'` is harmless. Without this, the `t → worktree list → t → tracker` round trip was still falling through `handleTracker`'s fallback path because `trackerProject` had been nulled.

### 3. Kanban selection preserved across navigation (in-session, per-project, by slug)
- Added `trackerSelectionBySlug: Record<string, string>` state to `UIContext`, plus `getTrackerSelection(projectName)` / `setTrackerSelection(projectName, slug)` methods (wrapped in `useCallback`).
- `TrackerBoardScreen` now:
  - On mount, reads the saved slug for the current project and locates it in `board` (which includes worktree-orphan items too). If found, sets `selectedColumn` and `selectedRowByColumn` accordingly.
  - On project change (via P picker), loads the new project's saved selection the same way, falling back to (0, 0).
  - On every selection change, writes the current item's slug back to context.
  - Tracking is by **slug**, so items that move between stage columns remain selected.
- Added helper `findSlugPosition(board, slug)`.

### Key design details
- **`firstSyncRef` gate on the sync effect**: skips the very first post-mount tick so the initial `(0, 0)` render doesn't clobber the remembered slug before `mount-restore` has applied. Also reset when the project changes, to avoid writing the stale pre-switch item into the new project.
- **No disk persistence**: selection is held in React state only. Restarting the app resets selection — explicitly per the requirements.
- **Stale slug tolerated**: if the remembered item no longer exists, restoration falls through to `(0, 0)` and the stale slug lingers harmlessly until overwritten by the next selection change.

## Testing
- `npm run typecheck` — clean.
- `npx jest` — 590 tests pass, no regressions.

## Notes for cleanup
- No new tests added. Selection restore is UI-level React state with minimal branching; manual testing of the navigation flow is the most valuable check.
- `lastTrackerProject` module is now only imported from `App.tsx`. The setter is no longer used elsewhere, so if anything else ever wants to record the last project, that's the single place to call it from.
