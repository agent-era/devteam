# Filesystem and Layout

## Projects directory

The app is given a root directory (via `--dir`, `PROJECTS_DIR`, or cwd). It expects this layout:

```
{root}/
  {project}/                          # main worktree (default branch)
  {project}-branches/
    {feature}/                        # feature worktree
    {feature2}/
  {project}-archived/
    archived-{timestamp}_{feature}/   # archived worktree
```

Multiple projects can coexist under the same root. The app discovers them by scanning for directories that match this naming pattern.

## Per-worktree files

DevTeam copies these files into each new feature worktree at creation time:

| File | Purpose |
|------|---------|
| `.env.local` | Environment variables |
| `.claude/settings.local.json` | AI tool settings (Claude) |
| `CLAUDE.md` | AI context document for Claude |

Source is always the main worktree of the same project.

## Project config

Each project stores its config at `{project-root}/.devteam/config.json`. This is created by the settings/AI editing workflow. See [concepts/project-config.md](../concepts/project-config.md).

## PR disk cache

`PRStatusCacheService` writes PR status to disk. Cache entries are keyed by `{worktree-path}:{commit-hash}`. A cache hit is valid only when the current HEAD commit matches the cached commit, so merges and new commits automatically invalidate it.

Location: inside the worktree directory (exact path is internal to `PRStatusCacheService`).

## Logs

```
{cwd}/logs/
  console.log   # all console output
  errors.log    # errors and stack traces
```

Logs rotate at 10 MB, keeping the old file with a timestamp suffix.

## tmux session naming

Sessions are named deterministically so the app can re-attach without storing IDs:

```
dev-{project}-{feature}           # AI agent session
dev-{project}-{feature}-shell     # shell session
dev-{project}-{feature}-run       # run/command session
```

For workspaces (multi-project):

```
dev-workspace-{workspace-name}    # single shared session
```
