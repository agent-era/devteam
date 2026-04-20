---
title: new-item
slug: new-item
updated: 2026-04-20
---

## What was built

Derive-first item creation for the tracker board. When the user types a title and presses Enter:

1. If multiple AI tools are available, the tool picker appears first.
2. A placeholder row with a braille spinner ("deriving slug…") appears in the target column. The item does **not** exist on the board yet — no temp slug, no rename.
3. `claude -p` is asked for a concise 2–4 word kebab-case slug via `runClaudeAsync`. On timeout (8s) or failure, the slugified title is used.
4. Just before writing, slugs are re-read from disk and deduplicated with a numeric suffix so two rapid back-to-back creates can't collide.
5. `createItem` writes the item with its final slug. `notes.md` gets the user's typed description (the discovery seed); `requirements.md` stays a frontmatter stub with just the title.
6. The item pops onto the board and the background session launch fires via `launchSessionBackground` on `WorktreeCore` (extracted `createSessionIfNeeded` helper shared with `attachSession`).

## Key decisions

- **Derive-first, not temp-slug**: user sees the placeholder spinner for ~5s, then the real item appears with its final slug. No rename, no churn.
- **User description → notes.md**: the user's initial description is exactly the kind of "problem / why" content the discovery stage writes to `notes.md`. Requirements stays pristine.
- **Tool picker shows BEFORE derivation**: otherwise the user would type a title, wait 5s, and only then be prompted for a tool.
- **2s per-project poll on the board**: the top-level 60s refresh was too slow to pick up `ai_status` transitions after a new session boots. Added `refreshProjectWorktrees(project)` that reuses `refreshWorktreeIndices` with project-filtered indices.
- **Parallel fetch + change detection** in `refreshWorktreeIndices`: tmux + git status per worktree now runs via `Promise.all` (N× wall-clock speedup), and `setState` is skipped when `worktreeStatusEquals` shows nothing changed so subscribers don't re-render every tick.
- **Invalidate git slow cache** after worktree creation and after background session launch so committed stats appear on the next tick, not after the 60s refresh.

## Files changed

- `src/services/TrackerService.ts`: `createItem` writes body to `notes.md` (not requirements); `writeRequirementsStub` helper; `deriveSlug` unchanged; `renameItem` removed.
- `src/screens/TrackerBoardScreen.tsx`: tool picker before derivation; placeholder spinner row in target column; 2s `refreshProjectWorktrees` effect; error logging on background launch.
- `src/screens/TrackerProposalScreen.tsx`: passes proposal's AI-derived slug + description through to `createItem`.
- `src/cores/WorktreeCore.ts`: extracted `createSessionIfNeeded` and `refreshWorktreeIndices` helpers; added `launchSessionBackground` and `refreshProjectWorktrees`; added `worktreeStatusEquals`; git slow cache invalidation on worktree creation.
- `src/contexts/WorktreeContext.tsx`: exposes `launchSessionBackground` and `refreshProjectWorktrees`.
- Tests: `tracker-board-create-flow.test.ts`, `tracker-proposal-create.test.ts`, `tracker-derive-slug.test.ts` (deriveSlug fallback paths with mocked runClaudeAsync).
