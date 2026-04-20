---
title: preserve-kanban-selection
slug: preserve-kanban-selection
updated: 2026-04-20
---

## Problem

Two related bugs on the kanban board:

1. **Project switches unexpectedly** when navigating around the app — returning to the tracker lands on a different project than the one the user was viewing.
2. **Kanban selection (column/row) is lost** when navigating away and back.
3. **Last project persisted too aggressively** — mid-session project switches overwrite the "last project" file, so the next app launch starts on the wrong project.

## Why

Root causes identified during discovery:

- `handleTracker()` in `App.tsx:201` re-runs `discoverProjects()` and falls back to `showTracker(projects[0])` when no worktree matches a project, ignoring the currently active `trackerProject`.
- `selectedColumn` / `selectedRowByColumn` are local React state in `TrackerBoardScreen` and the effect at `TrackerBoardScreen.tsx:148–161` resets them whenever `project`/`projectPath` changes — which happens on every `showTracker()` call.
- `setLastTrackerProject()` is called unconditionally inside `showTracker()` in `UIContext.tsx:231`, persisting every mid-session switch instead of only recording the app-launch project.

## User stories

- As a user on the kanban board, I want to navigate away (e.g. open an item, view a diff) and come back with the same item still selected, so I don't have to find my place again.
- As a user working in one project, I want navigating around the app to never silently switch me to a different project.
- As a user, I want the "last project" memory to reflect the project I actually launched with next time, not the last one I happened to peek at.

## Summary

Preserve in-session kanban selection and stop unwanted project switches. Selection is remembered per-project and tracked by item slug (so if an item moves between stages, selection follows it). `setLastTrackerProject()` is called only at app launch. `handleTracker()` keeps the active project when one is already set. No on-disk persistence of selection — it resets on app restart.

## Acceptance criteria

1. Navigating from the kanban board to any other screen (item detail, diff, settings, tool selection, etc.) and returning restores the previously selected column and item.
2. Selection is tracked by item **slug**, not by column/row index: if an item moves from one stage column to another (or is reordered within a column), selecting it remains the same item.
3. If the previously selected item no longer exists (archived, deleted), selection falls back gracefully to a valid item in the same column (or column 0, row 0 if the column is gone).
4. Selection is per-project: switching between projects and back restores each project's own last selection.
5. Selection does **not** persist across app restarts — on launch, selection starts at defaults.
6. Navigating around the app never changes the active project. The project only changes when the user explicitly picks one (project picker, `P` key) or at app launch.
7. `setLastTrackerProject()` is called only from the app-launch path (not from `showTracker()`); mid-session project switches do not overwrite the persisted "last project".
8. On app launch, the persisted last-project is still read and used to select the initial project as before.
