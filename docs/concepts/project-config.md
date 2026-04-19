# Project Config

Each project stores its config at `{project-root}/.devteam/config.json`.

## Structure

The config is a JSON object written and read by `AIToolService` and `WorktreeCore`. Fields currently used:

```json
{
  "aiTool": "claude",          // preferred AI CLI for this project
  "workspace": "my-workspace", // workspace name if part of a workspace
  "workspaceChildren": [       // list of child worktree feature names
    "project-b/my-feature"
  ]
}
```

The schema is intentionally loose; the app reads only the fields it knows about and ignores others.

## AI editing

The settings workflow lets users generate or edit the config with an AI agent. See [features/settings-ai-editing.md](../features/settings-ai-editing.md) for the user flow.

`WorktreeCore` exposes:
- `readConfigContent(project)` — reads raw JSON string
- `generateConfigWithAI(project)` — AI creates a new config from scratch
- `editConfigWithAI(project, instructions)` — AI edits existing config

Under the hood these open a tmux session where the AI agent edits the file, then the session is closed and the app re-reads the file.

## File copying

When a new feature worktree is created, `.devteam/config.json` from the main worktree is **not** automatically copied. The settings in the main worktree's config apply to the project as a whole, not to individual feature branches.

The files that **are** copied to new worktrees are listed in [architecture/filesystem-and-layout.md](../architecture/filesystem-and-layout.md).
