# Tmux and AI Sessions

## Session types per worktree

Each feature worktree can have up to three tmux sessions:

| Session suffix | Purpose | Attach shortcut |
|---|---|---|
| (none) | AI agent (Claude or Gemini) | `a` |
| `-shell` | Interactive terminal | `s` |
| `-run` | Running a command/server | `r` |

Sessions are created lazily: the agent session is created at feature-creation time; shell and run sessions are created on first attach.

## AI status polling

`TmuxService` polls the visible pane output every ~2 s to determine AI status. It looks for known strings in the last few lines:

| Text found | `ai_status` |
|---|---|
| `esc to interrupt` | `working` |
| Numbered prompt like `1. ` | `waiting` |
| Thinking indicator | `thinking` |
| Standard shell prompt | `idle` |

The status drives the indicator shown next to each worktree row in the list.

## AI tool abstraction

`AIToolService` (`src/services/AIToolService.ts`) abstracts over multiple AI CLIs (currently Claude and Gemini). It:

- Detects which tools are installed (`getAvailableAITools()`)
- Reads the stored preference from `.devteam/config.json`
- Provides `needsToolSelection()` to gate the attach flow

If multiple tools are available and no preference is stored, the UI shows the `selectAITool` dialog before attaching.

The `AI_TOOLS` constant in `src/constants.ts` lists all supported tools and their launch commands.

## Workspace sessions

A workspace is a single tmux session that opens panes for multiple projects side by side. `WorkspaceService` constructs the layout. See [features/session-lifecycle.md](../features/session-lifecycle.md) for the user flow.

## tmuxAttachLoading mode

Attaching to a tmux session temporarily exits the Ink rendering loop (the terminal is handed to tmux). UIContext's `tmuxAttachLoading` mode shows a minimal overlay before the handoff. After the user detaches from tmux, the app re-renders.
