# Status Model

Three independent status objects attach to each `WorktreeInfo`.

## GitStatus

Represents local git state. Set by `GitService` during refresh.

```typescript
{
  has_changes: boolean;      // any uncommitted changes
  modified_files: number;
  added_lines: number;
  deleted_lines: number;
  untracked_files: string[]; // relevant for archive safety check

  has_remote: boolean;
  ahead: number;             // commits ahead of remote
  behind: number;            // commits behind remote
  is_pushed: boolean;        // ahead === 0
}
```

`needs_attention` on `WorktreeInfo` returns true if `has_changes || !is_pushed`.

## SessionInfo

Represents tmux session state. Polled by `TmuxService` every ~2 s for visible rows.

```typescript
{
  session_name: string;
  attached: boolean;           // someone is currently in this tmux session
  ai_status: 'working' | 'waiting' | 'thinking' | 'idle' | 'none';
  ai_tool: string;             // 'claude', 'gemini', etc.
  shell_attached: boolean;
  run_attached: boolean;
}
```

`ai_status: 'none'` means the session does not exist yet.

## PRStatus

Represents GitHub PR state. Loaded async by `GitHubCore`.

```typescript
{
  loadingStatus: 'not_checked' | 'loading' | 'no_pr' | 'exists' | 'error';

  // only present when loadingStatus === 'exists'
  number?: number;
  state?: 'OPEN' | 'MERGED' | 'CLOSED';
  title?: string;
  checks?: { passing: number; failing: number; pending: number; };
  mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';

  // computed helpers
  is_merged: boolean;
  is_open: boolean;
  needs_attention: boolean;    // open + checks failing or review needed
  is_ready_to_merge: boolean;  // open + all checks green + mergeable
}
```

PRStatus is not computed during the main refresh cycle. It is fetched separately by `GitHubCore` and merged into the worktree model before the context emits a state update.

## action_priority

`WorktreeInfo.action_priority` aggregates all three statuses into a single sort key used to order worktrees by urgency:
1. PR needs attention
2. Uncommitted changes
3. Not pushed
4. Session active (AI working)
5. No notable state
