# Diff Review and Comments

## Goal

View the git diff for a worktree inline in the CLI, annotate lines with comments, and send those comments to the AI agent session.

## User path

1. Press `d` on a worktree row in the list.
2. UIContext transitions to `diff` mode with `diffWorktree` and `diffType` set.
3. `DiffView` renders the diff using `GitService.getDiff()`.
4. User navigates lines with arrow keys, presses `c` to add a comment on the current line.
5. Comments accumulate in `CommentStoreManager` (in-memory, keyed by worktree path).
6. User presses `Enter` to send all comments to the AI agent tmux session via `TmuxService.sendKeys()`.
7. UIContext returns to `list` mode.

## Diff types

`diffType` in UIContext can be:
- `'staged'` — only staged changes
- `'unstaged'` — only unstaged changes
- `'all'` — full working tree diff

The user can cycle between types from within `DiffView`.

## Comment model

```typescript
class DiffComment {
  lineNumber: number;
  lineContent: string;
  comment: string;
  file: string;
}

class CommentStore {
  worktreePath: string;
  comments: DiffComment[];
}
```

Comments are cleared from memory after they are sent. They are not persisted to disk.

## Modules

- `src/components/views/DiffView.tsx` — UI rendering and keyboard handling
- `src/services/GitService.ts` — `getDiff()`
- `src/services/CommentStoreManager.ts` — comment accumulation
- `src/services/TmuxService.ts` — `sendKeys()` to deliver comments to agent
