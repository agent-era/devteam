---
title: preserve-kanban-selection discovery notes
updated: 2026-04-20
---

## User problem

Two related bugs:

1. **Project switches unexpectedly when navigating around the app** — returning to the tracker lands on a different project than the one the user was viewing.
2. **Kanban selection (column/row) is lost** when navigating away and back.
3. **Last project persisted too aggressively** — mid-session project switches overwrite the "last project" file, so the next app launch starts on the wrong project.

## Root causes

### Bug 1: Unexpected project switch on navigation
`handleTracker()` in `App.tsx` (line 201) re-runs `discoverProjects()` every time and tries to match the selected worktree to a project. If no match is found it falls back to `showTracker(projects[0])` — ignoring `trackerProject` (the currently active project). So navigating away and back resets to project[0] whenever the focused worktree doesn't match.

### Bug 2: Selection lost
`selectedColumn` and `selectedRowByColumn` are local React state in `TrackerBoardScreen`. The effect at lines 148–161 explicitly resets both to defaults whenever `project`/`projectPath` changes — which happens on every call to `showTracker()` (even with the same project, since a new object reference is created).

### Bug 3: Last project written on every showTracker call
`setLastTrackerProject()` is called unconditionally inside `showTracker()` in `UIContext.tsx` (line 231). Should only be called at app launch.

## Recommendation

- **Bug 1**: In `handleTracker()`, if `trackerProject` is already set, prefer it over re-discovering. Only fall back to worktree-matching / `projects[0]` when no project is currently active.
- **Bug 2**: Lift kanban selection state into `UIContext` (or a per-project map), so it survives navigation. Guard the reset effect to only fire on actual project *changes*, not reference changes.
- **Bug 3**: Remove `setLastTrackerProject()` from `showTracker()` and call it only in the app-launch path in `App.tsx`.
