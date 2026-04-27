---
slug: pr-changes-chips
stage: implement
updated: 2026-04-26
---

# What was built

A second chip row on tracker-board cards that surfaces the same git/PR
signals the worktree mainview shows in dedicated columns:

- **diff** chip — `+adds/-dels` against base, **excluding `tracker/**`** so
  agent-driven status.json / requirements.md / notes.md churn doesn't
  dominate. Blue background.
- **changes** chip — `↑ahead ↓behind` commits vs. base. Cyan background.
- **PR** chip — `#NNN` plus a single-char check badge (`✓ x * !`). Color
  reflects state: green (passing/mergeable), red (failing/conflicts),
  yellow (pending/loading), gray (fallback).

Each chip is independent and renders only when its underlying value is
meaningful. The whole second row is omitted when none would render, so
clean worktrees stay visually quiet.

# Files

- `src/models.ts` — added `base_added_lines_excl_tracker` /
  `base_deleted_lines_excl_tracker` fields to `GitStatus` (default 0).
- `src/services/GitService.ts` — extended `GitSlowMetrics` with
  `committedAddedExclTracker` / `committedDeletedExclTracker`. Added one
  extra `git diff --shortstat <baseRev> HEAD -- ':!tracker'` call alongside
  the existing committed shortstat, both in `computeAndCacheSlowMetrics`.
  Same slow-cache TTL (`GIT_SLOW_TTL_MS`), so the cost is paid at most once
  per 30s per worktree.
- `src/cores/WorktreeCore.ts` — added the two new fields to the GitStatus
  equality check so card re-renders pick up changes.
- `src/screens/codeStateChips.ts` — new pure function
  `computeCodeStateChips(worktree)` returning `{label, color}[]` in fixed
  order: diff, changes, PR. Reuses mainview's `formatDiffStats`,
  `formatGitChanges`, `formatPRStatus` helpers.
- `src/screens/TrackerBoardScreen.tsx` — renders the new row as a sibling
  `Box marginLeft={4} flexWrap="wrap"` immediately below the existing
  running-chips Box. Secondary `maxLines` now subtracts one per present
  chip row (was: subtract one when running chips present) so the per-card
  4-row scroll budget holds when both rows render.
- `tests/unit/codeStateChips.test.ts` — 14 cases covering null/empty,
  each-chip-alone, color mapping for all PR states, merged/loading
  suppression, ordering, and diff-counts-only-when-excl-tracker-nonzero.
- `tests/unit/statusChipMapping.test.ts` — added the two new GitStatus
  fields to the inline test fixture so it satisfies the `Partial<GitStatus>`
  override (typecheck fix).

# Key decisions

- **Diff chip uses committed-only counts.** `base_added_lines_excl_tracker`
  is computed from `git diff <mergeBase> HEAD` only, NOT folding in
  working-tree adds the way the mainview's `base_added_lines` does. Per
  the requirements: the chip is meant to show "what code has changed vs.
  base, minus tracker noise" — folding in working-tree adds would re-
  introduce the per-item status.json churn the chip is filtering out.
- **Pathspec `:!tracker`** (with `--`) excludes the entire `tracker/`
  directory, not just `*.md`. Cleanest definition of "non-tracker
  changes" and matches the slug intent. Narrower scopes (e.g. just
  `*.md`) would still let `tracker/index.json` and `status.json` leak
  into the count.
- **Mainview is unchanged.** Only the tracker chip consumes the new
  fields; mainview's diff column keeps its existing full-count behavior.
  The new fields cost one extra git call per worktree on the slow-cache
  refresh, so the impact is bounded.
- **Layout.** Code-state chips render in a sibling `Box` below the
  running chips, indented to the same gutter, with `flexWrap="wrap"` so
  narrow columns spill chips to a second line instead of truncating.
  `ROWS_PER_ITEM` stayed at 4; the per-card budget holds because secondary
  `maxLines` drops by `chipRowCount` (0, 1, or 2) instead of the previous
  binary "running chips present? -1".
- **Inactive items render chips in plain-text mode.** Followup: the
  initial implementation kept colored backgrounds on inactive cards, but
  user feedback was that bright pills on dimmed cards read as too loud.
  Fix: when `item.inactive` is true, render via `StatusChip` with
  `color={undefined}` and `fg={chip.color}` so the same semantic color
  shows up as text instead of a background. Applied to both running and
  code-state chip rows.
- **PR chip suppression is narrow.** Hidden only while the PR fetch is
  unresolved (`loading` / `not_checked`) or when there's no PR number.
  Merged PRs DO get a chip (gray, `#NNN⟫`) so the merged state is
  visible alongside the PR number, not just via the secondary "Merged"
  label — useful when scanning the board for which merged item belongs
  to which upstream PR.
- **Diff and changes chips are plain text, not filled pills.** Three
  filled pills next to the agent/shell/run row read as a badge dump.
  Diff and changes chips render as plain colored text (no background);
  only the PR chip keeps a filled pill. `CodeStateChip` carries a
  `plain: boolean` flag so the rendering layer doesn't have to know
  about the diff/changes/PR distinction.
- **Diff and changes chips fade to gray when nothing is pending.** Color
  (blue / cyan) is reserved for "you have local work that isn't on the
  remote" — `!git.is_pushed`, which already implies either uncommitted
  changes or unpushed commits. When everything is committed and pushed
  the chips still render (the diff against base is real information),
  but in gray so the eye isn't drawn to a clean state.
- **Merged cards render every chip in gray.** Both the running-status
  row (agent/shell/run) and the code-state row drop their colors when
  `prMerged` is true. The merged card is "done, archived" — sessions
  that happen to still be attached or stray git state on it should not
  compete with active work for attention. The check is in the renderer
  (the chip data still carries its semantic color), so untangling the
  precedence is local to one render block.
- **PR data is sourced from `GitHubContext.pullRequests[wt.path]`**, not
  from `WorktreeInfo.pr`. Followup after rebasing on PR #229: that PR
  pointed out `wt.pr` was always unset, so the original implementation's
  PR chip never rendered. `computeCodeStateChips` now takes `pr` as a
  separate argument; the call site in `TrackerBoardScreen.tsx` looks it
  up from the GitHub context (already wired for `isItemPRMerged`).

# Notes for cleanup

- `git diff … -- ':!tracker'` magic-pathspec syntax is well-supported in
  modern git but is the kind of thing a reviewer might want to verify
  against the project's minimum git version. The project doesn't appear
  to pin a minimum, and the `:!` syntax has been in git since 2.13 (2017).
- `flexWrap="wrap"` on the chip row is the only place we use Yoga
  wrapping inside a card. If the layout looks odd in narrow columns at
  runtime, it's the spot to revisit (could swap for explicit truncation).
- No mainview changes were made. If a future story wants the mainview
  diff column to also exclude tracker noise, it can swap which field it
  reads — the data is already there.

## Stage review

Implemented as designed. All 760 tests pass; typecheck and build clean.
The codeStateChips function mirrors runningChips exactly in shape and
testing pattern, so the two stay easy to reason about as a pair. The
GitService change adds one bounded extra git call per worktree on the
slow-cache path; no API churn beyond the two new GitStatus fields.
