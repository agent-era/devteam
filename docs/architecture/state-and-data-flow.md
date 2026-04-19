# State and Data Flow

## Core Engine Pattern

Both `WorktreeCore` and `GitHubCore` implement `CoreBase<T>` from `src/engine/core-types.ts`:

```typescript
interface CoreBase<T> {
  getState(): T;
  subscribe(fn: (state: T) => void): () => void;  // returns unsubscribe fn
}
```

Context providers subscribe on mount and call `setState` on every emission:

```typescript
useEffect(() => {
  return core.subscribe(state => setLocalState(state));
}, []);
```

This keeps React concerns out of the business logic and makes Cores testable without React.

## WorktreeCore state

```typescript
{
  worktrees: WorktreeInfo[];   // sorted, workspace-grouped list
  loading: boolean;
  lastRefreshed: number;
  selectedIndex: number;
  memoryStatus: MemoryStatus | null;
  versionInfo: any | null;
}
```

**Refresh loops inside WorktreeCore:**
- AI/session status: every ~2 s (only visible rows)
- Git status: every ~5 s
- Full refresh (discovers new worktrees): every ~30 s
- Memory check: every ~30 s

`refreshVisibleStatus()` and `forceRefreshVisible()` are also called explicitly after navigation events.

## GitHubCore state

```typescript
{
  pullRequests: Record<string, PRStatus>;  // keyed by worktree path
  loading: boolean;
  lastUpdated: number;
  visibleWorktrees: string[];              // paths currently on screen
}
```

**Refresh strategy:** GitHubCore only refreshes PRs for currently-visible worktrees. When the visible set changes (user scrolls), `setVisibleWorktrees()` is called and the next poll fetches only those paths. Batch fetches are throttled to reduce GitHub API calls. Results are written to a disk cache (`PRStatusCacheService`) keyed by commit hash; stale cache entries are invalidated when the commit hash changes.

## UIContext state machine

UIContext holds a single `mode` string plus per-mode auxiliary data:

```
'list'                 → main view (no auxiliary data)
'create'               → createProjects: ProjectInfo[]
'confirmArchive'       → pendingArchive: WorktreeInfo
'help'                 → (none)
'pickProjectForBranch' → createProjects: ProjectInfo[]
'pickBranch'           → branchProject, branchList
'diff'                 → diffWorktree, diffType
'selectAITool'         → pendingWorktree: WorktreeInfo
'tmuxAttachLoading'    → (none, brief overlay)
'noProjects'           → (none)
'info'                 → info: string
'settings'             → settingsProject, settingsAIResult
```

Transitions always go through a named method (`showList()`, `showDiffView()`, etc.) that sets mode and clears unrelated auxiliary data.

`resetUIState()` clears transient data but preserves `settingsAIResult` so an in-flight AI settings operation can complete even if the user navigates away.

## Keyboard input

`useKeyboardShortcuts` in `WorktreeListScreen` handles all global keys. It reads current UI mode from `UIContext` and dispatches to `WorktreeContext` or `UIContext` accordingly. Dialogs and overlays request focus via `InputFocusContext` to capture keys before the global handler sees them.

## Provider nesting order

```
InputFocusProvider        (must be outermost — focus state is global)
  GitHubProvider          (independent of worktree state)
    WorktreeProvider      (may read GitHub context for PR data)
      UIProvider          (needs both for navigation guards)
        AppContent
```
