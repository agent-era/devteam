# Feature Creation

## Goal

Create one or more git worktrees (one per selected project) for a new feature branch, copy environment files into each, and start an AI agent session.

## User path

1. Press `n` on the list screen.
2. If no projects are discovered, the `noProjects` dialog appears instead.
3. `CreateFeatureScreen` shows a project picker (multi-select).
4. User types a feature name and confirms.
5. For each selected project, `WorktreeCore.createFeature(project, name)` is called:
   - Creates git worktree at `{root}/{project}-branches/{name}/`
   - Copies `.env.local`, `.claude/settings.local.json`, `CLAUDE.md` from the main worktree
   - Creates tmux session `dev-{project}-{name}`
6. List refreshes and the new worktrees appear.

## Multi-project creation

Selecting multiple projects in step 3 creates one worktree per project, all using the same feature name. This is the entry point for workspace-style development.

## Modules

- `src/screens/CreateFeatureScreen.tsx` — UI
- `src/cores/WorktreeCore.ts` — `createFeature()`
- `src/services/GitService.ts` — `createWorktree()`
- `src/services/TmuxService.ts` — `createSession()`

## Edge cases

- If the branch name already exists as a git branch, `GitService` returns an error and the screen shows it inline.
- If the worktree directory already exists on disk, creation fails; the user must delete it manually.
- Auto-suffix on conflict: when creating a worktree from an archived branch, if the branch name is taken the app auto-appends a numeric suffix.
