## What was built

Two fixes to tracker item archiving from the kanban board:

1. **Archiving a worktree now also archives the tracker item**: `ArchiveConfirmScreen` calls `TrackerService.moveItem(projectPath, feature, 'archive')` after the worktree is removed. `projectPath` is threaded through `UIContext.pendingArchive` and `showArchiveConfirmation`'s options.

2. **Tracker items without a worktree are now archivable**: `TrackerBoardScreen` no longer guards `onArchive` with `hasWorktree` — any selected item gets the `v` shortcut. When no worktree exists, a stub `WorktreeInfo` with `path: ''` is passed; `ArchiveConfirmScreen` detects this and skips git operations.

## Key decisions

- Kept changes minimal: no new UI mode, just gate on `featureInfo.path` being truthy inside `ArchiveConfirmScreen`.
- `projectPath` only flows through the kanban path — the main worktree list (`App.tsx`) doesn't pass it, so the main list's archive flow is unchanged (worktree-only, no tracker side effect). This is correct since the main list isn't tracker-aware.
- Footer archive hint (`v`) now shows for all items, with worktree-specific hints (s/x/d) remaining worktree-gated.
