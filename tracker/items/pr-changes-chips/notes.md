---
slug: pr-changes-chips
stage: discovery
updated: 2026-04-26
---

# Problem

Tracker board cards already render running-status chips (agent / shell / run)
to show which tmux sessions are live, but they don't surface the git/PR
signals that the worktree mainview shows in dedicated columns:

- `diff` — `+adds/-dels` against base
- `changes` — `↑ahead ↓behind` commits vs. base
- `pr` — `#NNN` plus a single-char check/state badge (`✓ x * ! ⟫`)

Those facts are "non-tracker" — they come from git + GitHub, not the
tracker's stage workflow — but they're still useful at a glance from the
kanban so users can see real code state without bouncing to mainview.

# Findings

## Where things live
- Cards: `src/screens/TrackerBoardScreen.tsx`, in `renderColumn` (the
  `visibleItems.map` block around L744–L850).
- Existing chip computation: `src/screens/runningChips.ts` — pure function
  on `WorktreeInfo` returning `{label, color}[]`, rendered via `StatusChip`.
- MainView source of truth for the equivalent cells:
  `src/components/views/MainView/WorktreeRow.tsx` + `utils.ts`
  (`formatDiffStats`, `formatGitChanges`, `formatPRStatus`).
- All three values come from `WorktreeInfo.git` / `WorktreeInfo.pr`, which
  the board already accesses through `getWorktreeForItem(item)`. No new
  fetch / cache work is required for the changes/PR chips.

## Card layout budget
- `ROWS_PER_ITEM = 4` per card (slug + 2 secondary lines + marginBottom).
- The current chip row eats 1 of those rows; secondary `maxLines` already
  drops by 1 when chips render, to keep scroll math intact
  (`TrackerBoardScreen.tsx:809–810`).
- A second chip row (resolved layout — see below) costs 1 more of the
  4 budgeted rows when it renders. Secondary `maxLines` will need to drop
  by 1 more when *both* chip rows are present.
- Column widths range 20–50 chars (`MIN_COLUMN_WIDTH` / `MAX_COLUMN_WIDTH`).
  Code-state chips like `+1.2k/-340`, `↑5 ↓2`, `#1234✓` add up fast — chips
  hide when their value is "clean" so cards only render the row when there's
  something interesting.

## Diff exclusion (tracker md files)
- `git.base_added_lines` / `base_deleted_lines` come from
  `GitService.computeAndCacheSlowMetrics` (`src/services/GitService.ts:192`):
  one `git diff --shortstat <mergeBase> HEAD` plus the working-tree adds.
  Slow-cache TTL is `GIT_SLOW_TTL_MS`.
- Excluding tracker scaffolding requires an additional shortstat with a
  pathspec exclude (e.g. `':^tracker/**'`) on the same cache path. ~one
  extra git invocation per worktree per slow-cache refresh. Cheap.
- Recommended scope: exclude **all of `tracker/**`** (not just `*.md`) so
  the diff chip reflects "actual code changes" without any noise from the
  tracker tooling itself (status.json, index.json, stage configs, item md).
  Narrower scope is possible (`tracker/items/**/*.md` only) if the user
  prefers, but the broad scope is the cleanest definition of "non-tracker
  changes" and matches the user's intent in the slug.
- Mainview's existing diff column keeps using `base_added_lines` (full
  diff) — this change is additive (a second field) and only the tracker
  chip consumes it.

## Cross-checks
- For PR-merged cards the secondary text already says "Merged" in gray —
  the PR chip is suppressed there to avoid duplicating that signal.
- For orphan worktrees (no tracker entry) `getWorktreeForItem` already
  returns the worktree, so the new chips work for them too.
- `StatusChip` supports a "plain" mode (no background); not used here
  since the user opted for colored backgrounds for visual consistency.

# Recommendation

Add three "code state" chips on a **second** chip row below the existing
agent/shell/run row, in fixed order: `diff → changes → PR`. Each chip
renders only when meaningful, and the row itself is omitted when none of
them have anything to show. Wrap to additional lines if more chips are
added in the future.

| Chip    | Show when                       | Color                                                       |
|---------|---------------------------------|-------------------------------------------------------------|
| diff    | `excl_tracker_added + excl_tracker_deleted > 0` | blue (matches mainview's `UNCOMMITTED_CHANGES`) |
| changes | `ahead > 0 \|\| behind > 0`     | cyan (matches mainview's `UNPUSHED_COMMITS`)                |
| PR      | PR exists and not merged        | green (passing/mergeable) / yellow (pending/checking) / red (failing/conflicts) |

Backing data:
- Add `git.base_added_lines_excl_tracker` and `base_deleted_lines_excl_tracker`
  to `GitStatus`, computed in `GitService` via a second
  `git diff --shortstat … -- ':^tracker/**'` call on the slow-cache path.
  Mainview keeps using the full counts; only the tracker chip consumes the
  new fields.

Layout:
- Per-card row budget grows from 4 to handle: slug + 1 secondary + 1
  approve-hint (rare, only when ready-to-advance) + 2 chip rows = up to 5
  active rows. Either bump `ROWS_PER_ITEM` to 5, or keep it at 4 and let
  secondary `maxLines` drop further when both chip rows are present —
  the second option keeps existing scroll math intact and is preferred.
- Code-state chips render as a sibling `Box` immediately below the
  running-chips `Box`, indented with the same `marginLeft={4}`.

# Resolved design questions
- **Chip set:** all three (diff, changes, PR). Diff excludes tracker/ paths.
- **Clean state:** hide the chips entirely (no placeholders).
- **Visual style:** colored background, like the existing chips.
- **Layout:** separate row from agent/run, wrapping as needed.
