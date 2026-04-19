# Projects, Worktrees, and Workspaces

## Project

A **project** is a git repository. DevTeam discovers projects by scanning the root directory for directories that match the naming convention. The main worktree for a project lives at `{root}/{project-name}/`.

`ProjectInfo`:
```typescript
{ name: string; path: string; }
```

## Worktree

A **worktree** is a checked-out branch in a separate directory, managed by `git worktree`. Each worktree:
- Has its own working tree and HEAD
- Shares the git object store with the main worktree
- Can have its own tmux sessions

Feature worktrees live at `{root}/{project-name}-branches/{feature-name}/`.

`WorktreeInfo` is the central model. Key fields:

```typescript
{
  project: string;       // project name
  feature: string;       // branch / feature name
  path: string;          // absolute path on disk
  branch: string;        // git branch name

  git: GitStatus;        // ahead/behind, modified files, etc.
  session: SessionInfo;  // tmux session state and AI status
  pr?: PRStatus;         // GitHub PR (loaded async)

  // workspace fields — only set for workspace rows
  is_workspace: boolean;
  is_workspace_header: boolean;
  is_workspace_child: boolean;
  parent_feature?: string;
  children?: WorktreeInfo[];
  is_last_workspace_child: boolean;
}
```

## Workspace

A **workspace** groups multiple worktrees from different projects into a single tmux session. It represents a cross-repo feature being worked on together.

In the list view, workspaces appear as header rows with their children indented below. The header row shows aggregate status; child rows show per-worktree status.

Workspace membership is stored in `.devteam/config.json`. A worktree is a workspace child if its `parent_feature` field is set.

`is_workspace_header` rows are not real worktrees on disk — they are synthetic list rows inserted by `WorktreeCore` for display grouping.

## Session

A **session** is a tmux session attached to a worktree. Each worktree can have:
- An AI agent session (default)
- A shell session (`-shell` suffix)
- A run session (`-run` suffix)

See [status-model.md](status-model.md) for the `SessionInfo` field definitions.

## Invariants

- A project always has exactly one main worktree.
- Feature worktrees are always in `{project}-branches/`.
- Archived worktrees are always in `{project}-archived/` and are not shown in the list.
- Workspace headers always appear before their children in the list.
- `WorktreeInfo.path` is always an absolute path.
