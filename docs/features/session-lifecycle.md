# Session Lifecycle

## Session types

Each worktree supports three tmux sessions. They are created lazily on first attach.

| Key | Session | Suffix |
|-----|---------|--------|
| `a` | AI agent | (none) |
| `s` | Shell | `-shell` |
| `r` | Run | `-run` |

## Attach flow

1. User presses `a`, `s`, or `r` on a worktree row.
2. If attaching AI session and multiple AI tools are available with no stored preference, UIContext transitions to `selectAITool` mode. User picks a tool; preference is saved to `.devteam/config.json`.
3. UIContext transitions to `tmuxAttachLoading` (brief overlay).
4. `WorktreeCore.attachSession()` (or `attachShellSession()` / `attachRunSession()`) calls `TmuxService.attachSession()`.
5. Ink rendering pauses; the terminal is handed to tmux.
6. When user detaches (`Ctrl-b d`), Ink re-renders and `tmuxAttachLoading` clears.

## Workspace sessions

A workspace session (`w` key on a workspace header row) opens a single tmux session with multiple panes — one per child project. `WorkspaceService` builds the pane layout using `tmux split-window` commands.

`WorktreeCore.createWorkspace()` creates the workspace and sets `parent_feature` on each child worktree's config.

## Session naming

Sessions are named deterministically from project + feature name, so the app can re-attach after a restart without storing any session IDs. See [architecture/filesystem-and-layout.md](../architecture/filesystem-and-layout.md).

## AI status in the list

`TmuxService.getAIStatus()` reads the last few lines of the pane buffer and returns `working`, `waiting`, `thinking`, or `idle`. This is polled every ~2 s for visible rows and shown as a status indicator in the list.

## Session cleanup

Sessions are not deleted automatically. Archiving a worktree does not kill its tmux sessions; the user must run `tmux kill-session` manually if desired. This is intentional — an agent may still be running during archive.
