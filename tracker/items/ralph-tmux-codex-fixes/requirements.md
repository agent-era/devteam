---
title: "suggest fixes and improvements for the items found in ../ralph-tmux-codex-test (look at the tracker/items/ralph-tmux-codex-test md files)"
slug: ralph-tmux-codex-fixes
updated: 2026-04-26
---

## Problem

The exploratory campaign in `ralph-tmux-codex-test` produced nine concrete observations about the tracker + tmux + Codex flow. The user wants this item to turn that raw list into a curated set of fixes/improvements: which observations are real product bugs, which are agent-side, and what the smallest sensible code changes look like.

Source material:
- `../ralph-tmux-codex-test/tracker/items/ralph-tmux-codex-test/notes.md`
- `../ralph-tmux-codex-test/tracker/items/ralph-tmux-codex-test/requirements.md`
- `../ralph-tmux-codex-test/tracker/items/ralph-tmux-codex-test/implementation.md`

## Why

These five fixes block or degrade the realistic Codex-driven workflow that the tracker was designed for. Without them: a fresh worktree's plain attach exits immediately, a brand-new local sandbox repo can't even create a worktree, the kanban board mis-reports Codex sessions that are actually blocked on trust/sandbox/usage prompts as idle, every first prompted Codex launch flashes a scary-looking error, and silent slug/worktree drift can decouple tracker state from the actual sessions on disk. The campaign in `ralph-tmux-codex-test` already proved each of these reproduces during real use.

## Summary

Land a tight bundle of five small, independent fixes in `src/cores/WorktreeCore.ts`, `src/services/GitService.ts`, and `src/services/AIToolService.ts`, plus refreshed Codex state fixtures via the `capture-ai-states` skill. Each fix targets one root cause from the source campaign; together they collapse the original nine observations down to two that are explicitly out of scope (agent-side `status.json` write timing, and PTY-harness keystroke flakiness). No new features, no refactors, no API changes — only the smallest code change per fix that resolves the bug.

## Acceptance criteria

1. **Codex launches into a freshly-created worktree start fresh — no `resume`/`--continue`.** The launch path takes an explicit `isNewWorktree` signal from the caller (the `createFeature` / `recreateImplementWorktree` flows know they just created the directory). When it's true, the launch issues plain `codex …` (and the analogous `claude` / `gemini` fresh form) with no resume args. When it's false, the launch keeps using the existing resume form and trusts that a prior session exists. After the fix: attaching to a brand-new worktree never tries `codex resume --last` and so cannot exit immediately on "no saved session", and re-attaching to an existing worktree keeps today's resume behavior.

2. **`createWorktree` works against a brand-new local-only repo with no `origin` remote.** `GitService.createWorktree` skips `git fetch origin` when no `origin` remote exists, and when the resolved base branch came from a local ref (no `origin/` prefix) it does **not** synthesize an `origin/`-prefixed base when calling `git worktree add`. The previously-needed manual workaround (creating a fake bare `origin` repo) is no longer required.

3. **Codex blocking-modal pane states are detected as `waiting`.** `AIToolService.isWaitingForTool` recognises the codex first-run trust prompt, the sandbox-retry prompt, the usage-limit notice, and the model-switch prompt as `waiting`. After the fix, a session sitting on any of those modals shows up as `waiting` on the kanban board (and to ralph), not `idle`. Detector test fixtures in `tests/fixtures/ai-states/` are refreshed via the `capture-ai-states` skill (or hand-curated samples if capture isn't possible) so unit tests cover each new pattern.

4. **Prompted Codex launches into a freshly-created worktree no longer flash a `No saved session found with ID …` error.** This is the prompt-path counterpart of criterion 1: when the caller signals `isNewWorktree`, the prompted launch issues `codex … <prompt>` (no `resume --last`). When it's false, the launch keeps the existing `codex resume --last … <prompt> || codex … <prompt>` chain. We deliberately do **not** probe the codex sessions directory — it's brittle, and trusting the `isNewWorktree` flag from the caller is simpler and harder to get wrong. The first prompted launch in a brand-new worktree shows a clean codex pane.

5. **The unique-suffix is propagated everywhere — tracker slug, worktree dir, tmux session name all stay in lock-step.** Today, `WorktreeCore.createFeature` already suffixes (`feature-2`, `feature-3`, …) when a branch with the requested name exists, but the tracker slug stays at the original. After this fix: when a launch for a tracker item lands on a suffixed worktree name, the tracker item's slug is renamed to that suffixed value (its directory under `tracker/items/`, its entry in `tracker/index.json`'s buckets, and its key in `tracker/index.json#sessions` all move together), and the tmux session name follows because it's derived from the same value. The user sees a single consistent name everywhere — no silent drift, no error popup; the suffix is just adopted as the canonical slug. For tracker-driven create flows, slug derivation considers existing branches as well as existing tracker slugs so the suffix is chosen up front rather than after the worktree is created when possible.

6. **No regressions to existing AI-status detection.** Unit tests covering `AIToolService.getStatusForTool` for claude, gemini, and the existing codex idle/working states still pass. The new codex `waiting` patterns are additive.

7. **Each fix is a separate commit** with a one-line message naming the bug it resolves, so revert blast radius is one fix.

8. **`implementation.md` is written at the end** with a per-fix checklist of what landed, anything that turned out to need a slightly different shape than this requirements doc predicted, and explicit notes on which of the original nine observations are now closed vs. still open.

## Edge cases

- **Local-only repo with no `origin`, but a non-`main` default branch.** Handled by `findBaseBranch` already falling back through `master`, `develop`, and `origin/HEAD`. Make sure the new local-base path doesn't regress that fallback.
- **Local-only repo with no `origin` and no remote-tracking branch at all but `main` exists locally.** The expected behavior: `git worktree add <path> -b <new> main` (no `origin/` prefix). Confirm this is what `git worktree add` accepts.
- **`isNewWorktree` flag misuse.** A caller wrongly passing `isNewWorktree: true` for an existing worktree would skip resume even when a prior session exists; threading it from `createFeature` / `recreateImplementWorktree` (the only places that *just* created the directory) keeps the call sites narrow. Plain attaches default to `false`.
- **Codex modal text that overlaps the chat input.** Some codex modals may still render the `▌` cursor underneath; the new patterns should take precedence so a known modal isn't misread as `idle`.
- **Slug rename vs. legitimate re-creation.** `recreateImplementWorktree` rebuilds a worktree for an existing tracker item whose branch already exists for the same slug — that's not drift, it's reuse, and must not trigger a slug rename. The slug-rename path applies only when a *new* tracker item or new feature lands on a suffixed name during creation.
- **Tracker slug rename moves all references.** A rename must update the on-disk item directory, every `tracker/index.json` bucket containing the slug, the `sessions` key, and any in-memory tracker state — atomically enough that ralph and the kanban don't see a half-renamed item.
- **Detector fixture capture environment.** If `capture-ai-states` can't reach a real Codex (no API key / no network), fall back to hand-curated text snippets; do not block the detector fix on a working capture run.

## Out of scope

- Agent-side `status.json` write timing (original finding #6). Once the pane-state detector is improved (criterion 3), the board no longer relies solely on the agent's `status.json` to surface a blocked codex session, so the user-visible symptom is mitigated even though the underlying agent-write race is unchanged.
- PTY-harness keystroke unreliability for the inline tracker-create input (original finding #9). Likely environment-specific; revisit only if it reproduces from a real attached terminal.
- Any refactor of the `aiLaunchCommand` / `AI_TOOLS` config shape, the tracker-stage launch pipeline, the worktree directory layout, or the kanban rendering. This bundle stays surgical.
