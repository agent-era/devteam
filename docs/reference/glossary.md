# Glossary

**Project** — A git repository discovered by scanning the root directory. Always has a main worktree at `{root}/{name}/`.

**Worktree** — A git worktree: a checked-out branch in a separate directory on disk, sharing the object store with the main worktree. In this app, "worktree" usually means a feature worktree at `{root}/{project}-branches/{feature}/`.

**Feature** — The name of a branch and its associated worktree directory. Used interchangeably with "worktree" in UI copy.

**Workspace** — A named group of worktrees from different projects, opened together in a single tmux session with multiple panes.

**Session** — A tmux session. Each worktree can have an AI session, a shell session, and a run session.

**AI status** — The detected state of the AI agent inside a tmux pane: `working`, `waiting`, `thinking`, `idle`, or `none`.

**Core engine** — A plain TypeScript class (`WorktreeCore`, `GitHubCore`) that owns mutable state and exposes it via a `subscribe()` observer pattern. No React dependency.

**Context** — A React Context Provider that wraps a Core engine and makes its state and operations available to the component tree via hooks.

**CoreBase** — The interface that Core engines implement: `getState()` and `subscribe(fn)`.

**PR cache** — The disk-based cache of GitHub PR status, keyed by worktree path + commit hash. Managed by `PRStatusCacheService`.

**Visible worktrees** — The subset of worktrees currently rendered on screen (after pagination). `GitHubCore` only polls PRs for visible worktrees.

**Workspace header** — A synthetic list row in `WorktreeListScreen` that represents a workspace group. Not a real worktree on disk; `is_workspace_header === true`.

**AI tool** — The CLI program used as the AI agent: currently `claude` or `gemini`. Stored in `.devteam/config.json` as `aiTool`.

**action_priority** — A computed field on `WorktreeInfo` that ranks worktrees by urgency for display ordering.
