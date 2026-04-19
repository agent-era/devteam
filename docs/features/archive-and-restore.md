# Archive and Restore

## Archive

Archiving moves a worktree directory to `{root}/{project}-archived/archived-{timestamp}_{feature}/` and removes the git worktree registration. The branch itself is preserved.

### User path

1. Press `x` on a worktree row in the list.
2. `WorktreeCore` checks for untracked files in the worktree.
3. UIContext transitions to `confirmArchive` with `pendingArchive` set.
4. `ArchiveConfirmScreen` shows the worktree name and lists any untracked files (which will be lost).
5. User confirms; `WorktreeCore.archiveFeature()` is called:
   - Runs `git worktree remove --force`
   - Moves the directory to the archived location
   - Refreshes the list
6. The worktree disappears from the list.

### Untracked file warning

Untracked files are not tracked by git and will not be recoverable from git history. The archive confirmation screen lists them explicitly so the user can decide whether to commit or discard them first.

### tmux sessions

Archiving does **not** kill tmux sessions. If an agent session is running, it continues until the user kills it manually (`tmux kill-session -t dev-{project}-{feature}`).

## Restore

Archived worktrees can be restored (re-attached as a git worktree) from the branch picker. Press `b` to open the branch picker, select the archived branch, and a new worktree is created.

If the original branch name is already in use by another worktree, a numeric suffix is appended automatically.

## Modules

- `src/screens/ArchiveConfirmScreen.tsx` — confirmation UI
- `src/cores/WorktreeCore.ts` — `archiveFeature()`
- `src/services/GitService.ts` — worktree removal
- `src/contexts/UIContext.tsx` — `showArchiveConfirmation()`
