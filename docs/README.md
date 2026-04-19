# DevTeam Docs

DevTeam is a CLI tool that coordinates git worktrees, tmux sessions, AI agents, and GitHub PR state across one or more projects.

## Start here

For a mental model of how the pieces fit together: [architecture/overview.md](architecture/overview.md)

For what the key terms mean: [concepts/projects-worktrees-workspaces.md](concepts/projects-worktrees-workspaces.md)

For a map of the codebase: [reference/code-map.md](reference/code-map.md)

## By topic

### Architecture
- [overview.md](architecture/overview.md) — major components and boundaries
- [state-and-data-flow.md](architecture/state-and-data-flow.md) — Core engines, contexts, refresh loops
- [filesystem-and-layout.md](architecture/filesystem-and-layout.md) — directory conventions and persisted files
- [tmux-and-ai-sessions.md](architecture/tmux-and-ai-sessions.md) — session naming, status polling, AI tool integration
- [github-and-pr-caching.md](architecture/github-and-pr-caching.md) — PR cache, invalidation, refresh strategy
- [testing-strategy.md](architecture/testing-strategy.md) — unit, E2E, and terminal test layers

### Concepts
- [projects-worktrees-workspaces.md](concepts/projects-worktrees-workspaces.md) — stable nouns and their invariants
- [project-config.md](concepts/project-config.md) — `.devteam/config.json` structure and AI editing
- [status-model.md](concepts/status-model.md) — git, session, and PR status fields

### Features
- [feature-creation.md](features/feature-creation.md)
- [session-lifecycle.md](features/session-lifecycle.md)
- [diff-review-comments.md](features/diff-review-comments.md)
- [branch-picking.md](features/branch-picking.md)
- [settings-ai-editing.md](features/settings-ai-editing.md)
- [archive-and-restore.md](features/archive-and-restore.md)

### Reference
- [code-map.md](reference/code-map.md) — if you need X, open these files
- [glossary.md](reference/glossary.md)
- [decisions.md](reference/decisions.md) — non-obvious design choices

### Operations
- [release-and-version-check.md](operations/release-and-version-check.md)
