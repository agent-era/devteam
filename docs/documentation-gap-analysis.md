# Documentation Gap Analysis

## Current State

The repo has very little real product or architecture documentation today. The main sources are [README.md](../README.md), [AGENTS.md](../AGENTS.md), [tests/README.md](../tests/README.md), and one narrow doc at [version-check-and-publish.md](./version-check-and-publish.md).

### What is useful

- [README.md](../README.md) explains installation, basic usage, and the product pitch.
- [AGENTS.md](../AGENTS.md) has good intent: concepts, conventions, and testing philosophy.
- [version-check-and-publish.md](./version-check-and-publish.md) is a good example of a focused subsystem doc.
- The code itself is structured enough to document cleanly:
  - App shell in [src/App.tsx](../src/App.tsx)
  - State engines in [src/cores/WorktreeCore.ts](../src/cores/WorktreeCore.ts) and [src/cores/GitHubCore.ts](../src/cores/GitHubCore.ts)
  - UI routing in [src/contexts/UIContext.tsx](../src/contexts/UIContext.tsx)
  - List screen in [src/screens/WorktreeListScreen.tsx](../src/screens/WorktreeListScreen.tsx)
  - Diff workflow in [src/components/views/DiffView.tsx](../src/components/views/DiffView.tsx)

### What is inaccurate or stale

- [AGENTS.md](../AGENTS.md) describes files that no longer exist or are no longer the primary architecture: `usePRStatus.ts`, `useWorktrees.ts`, `ArchivedScreen.tsx`, `WorktreeService.ts`.
- It says the architecture is mainly services plus contexts, but the actual runtime model now centers on `Core` classes exposed through contexts.
- [tests/README.md](../tests/README.md) is stale. It still talks about old ESM and Jest issues and older test layout, while the repo now has broad unit, E2E, and terminal coverage.

## Big Gaps

The missing docs are mostly architectural, not API-level:

- No system overview explaining the major runtime pieces and how state flows through the app.
- No concepts doc for `projects`, `worktrees`, `workspaces`, `sessions`, and `project config`.
- No feature docs for the main workflows:
  - create feature and multi-project workspace
  - attach agent, shell, and run sessions
  - diff review and comment-send loop
  - branch picker and create-from-remote
  - settings generation and reapply flow
  - PR status caching and refresh behavior
- No doc that explains the current UI mode and state machine.
- No doc describing how tmux integration actually works.
- No doc describing what is persisted vs computed vs cached.
- No doc map for agents telling them where to start reading.

Two especially important undocumented realities:

- The product is now more than a worktree manager. It is a coordinator across git, tmux, AI CLIs, GitHub PR state, and cross-repo workspaces.
- The code has several important design decisions that deserve high-level docs: `CoreBase` state engines, workspace header rows in the main list, PR disk cache with commit-hash invalidation, AI-tool abstraction, and project-local `.devteam/config.json`.

## Recommended Docs Structure

`README.md` should stay short. `docs/` should become the real handbook.

```text
docs/
  README.md
  architecture/
    overview.md
    state-and-data-flow.md
    filesystem-and-layout.md
    tmux-and-ai-sessions.md
    github-and-pr-caching.md
    testing-strategy.md
  concepts/
    projects-worktrees-workspaces.md
    project-config.md
    status-model.md
  features/
    feature-creation.md
    session-lifecycle.md
    diff-review-comments.md
    branch-picking.md
    settings-ai-editing.md
    archive-and-restore.md
  reference/
    code-map.md
    glossary.md
    decisions.md
  operations/
    release-and-version-check.md
```

### What each area should do

- `docs/README.md`: entrypoint for humans and agents. Start here, then read these few docs first.
- `architecture/overview.md`: major components, boundaries, and the one-page mental model.
- `architecture/state-and-data-flow.md`: `App -> contexts -> cores -> services`, refresh loops, cache ownership, and UI modes.
- `concepts/*.md`: stable nouns and invariants, not implementation details.
- `features/*.md`: one workflow per file, with goal, user path, main modules, and notable edge cases.
- `reference/code-map.md`: if you need X, open these files.
- `reference/decisions.md`: short ADR-style records for non-obvious choices.

## AI-Friendly Documentation Guidelines

For AI readability, keep each doc:

- One topic per file.
- Front-loaded with a short summary.
- Explicit about source of truth in code, with file links.
- Focused on invariants, boundaries, and call paths.
- Free of low-level mechanics that are already obvious from code.
- Updated when architecture changes, especially when files move.

## Suggested Next Step

Turn this into an actual docs skeleton and rewrite the stale parts of:

- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [tests/README.md](../tests/README.md)
