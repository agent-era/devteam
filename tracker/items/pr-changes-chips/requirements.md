---
title: "add chips for PR and changes/commits, showing non-tracker changes. clarify with me what to do. similar info as mainview"
slug: pr-changes-chips
updated: 2026-04-26
---

# Problem

Tracker board cards already render running-status chips (agent / shell / run)
to show which tmux sessions are live, but they don't surface the git/PR
signals that the worktree mainview shows in dedicated columns:

- `diff` — `+adds/-dels` against base
- `changes` — `↑ahead ↓behind` commits vs. base
- `pr` — `#NNN` plus a single-char check/state badge (`✓ x * ! ⟫`)

# Why

Those facts are "non-tracker" — they come from git + GitHub, not the
tracker's stage workflow — but they're still useful at a glance from the
kanban so users can see real code state without bouncing to mainview.

# Summary

Add three "code state" chips to each tracker board card on a **second**
chip row, rendered immediately below the existing agent/shell/run row.
Chips: `diff`, `changes`, `PR`. Each chip is independent — it appears only
when its underlying value is meaningful. The whole second row is omitted
when none of the three would render. The diff chip's `+adds/-dels` count
excludes any path under `tracker/**` so the chip reflects "actual code
changes" without noise from the tracker tooling itself.

Backing data comes from `WorktreeInfo.git` and `WorktreeInfo.pr`, which the
tracker board already accesses via `getWorktreeForItem(item)`. A new pair of
fields on `GitStatus` carries the tracker-excluded diff counts; mainview
keeps using the existing full counts.

# Acceptance criteria

1. **Chip set.** A new `computeCodeStateChips(worktree)` function (sibling
   to `computeRunningChips`) returns up to three chips in fixed order:
   `diff`, `changes`, `PR`. Order is stable regardless of which subset
   renders.

2. **Diff chip.**
   - Label: `formatDiffStats(addedExclTracker, deletedExclTracker)` — same
     format as mainview's diff column (`+1.2k/-340` etc).
   - Renders only when `addedExclTracker + deletedExclTracker > 0`.
   - Background color: `blue` (matches mainview's `UNCOMMITTED_CHANGES`
     priority highlight).

3. **Changes chip.**
   - Label: `formatGitChanges(ahead, behind)` — same format as mainview
     (`↑5 ↓2`, etc).
   - Renders only when `ahead > 0 || behind > 0`.
   - Background color: `cyan` (matches mainview's `UNPUSHED_COMMITS`
     priority highlight).

4. **PR chip.**
   - Label: `formatPRStatus(pr)` — `#NNN` plus a single-char badge
     (`✓ x * !`); merged badge `⟫` is suppressed since the chip itself
     doesn't render for merged PRs.
   - Renders only when the PR exists, is not merged, and the PR data is
     past `loading` / `not_checked` (i.e. we have a real number to show).
   - Background color:
     - `green` — checks `passing` and not conflicting
     - `red` — checks `failing` or `has_conflicts`
     - `yellow` — checks `pending` or `loading`
     - `gray` — fallback (unknown checks, no badge)

5. **Hidden states (no chip).**
   - No worktree: no chip row at all (existing behavior for running chips
     applies — `getWorktreeForItem` returns null).
   - PR is merged: PR chip suppressed (the existing gray "Merged"
     secondary text already conveys this).
   - PR is in `not_checked` / `loading` state: PR chip suppressed.
   - Worktree is "clean" (no nonzero diff, no ahead/behind, no live PR):
     entire second chip row omitted.

6. **Tracker-path exclusion for diff.**
   - `GitStatus` gains two new numeric fields:
     `base_added_lines_excl_tracker`, `base_deleted_lines_excl_tracker`.
   - Computed in `GitService.computeAndCacheSlowMetrics` via one
     additional `git diff --shortstat <mergeBase> HEAD -- ':!tracker'`
     invocation, stored on the same slow-cache entry so the cost is paid
     at most once per `GIT_SLOW_TTL_MS` per worktree.
   - Working-tree adds (`status.added_lines`, `status.untracked_lines`)
     are NOT folded into the excluded counts — the chip's purpose is to
     show committed-against-base diff size minus tracker noise; including
     working-tree adds would re-introduce status.json churn from the
     agent's in-progress work. (Mainview's diff column keeps its existing
     behavior of summing all three.)
   - Mainview is not changed; only the tracker chip consumes the new
     fields.

7. **Layout.**
   - Code-state chips render in a sibling `Box` immediately below the
     running-chips `Box`, indented with the same `marginLeft={4}`.
   - Chips wrap to additional lines when more chips exist than fit on one
     line (Ink default wrap behavior on a `Box flexWrap="wrap"`).
   - Per-card row budget is updated so two chip rows + slug + secondary
     stays within column scroll math: secondary `maxLines` drops by 1
     additional line when both chip rows are present (one for running,
     one for code-state). Reserved row count
     (`ROWS_PER_ITEM`, `visibleItemSlots`, `scrollVisibleSlots`) grows by
     1 to account for the new row when present.
   - Chip styling reuses `StatusChip` with colored backgrounds and
     `fg="white"`, matching the existing running chips.

8. **Inactive items.** Code-state chips render on inactive cards too
   (no special suppression). Visual dimming continues to come from the
   existing `inactive` treatment on title/secondary; the chips themselves
   keep their colored backgrounds so a user can still see "this inactive
   item has 5 unpushed commits and an open PR".

9. **Tests.**
   - Unit test `tests/unit/codeStateChips.test.ts` covering: empty
     worktree → no chips; only ahead → only changes chip; PR merged → no
     PR chip; mixed states → correct order/colors.
   - Update `tests/unit/TrackerBoardScreen.test.ts` if it asserts on the
     card's per-item row count.
   - Existing `tests/unit/runningChips.test.ts` stays green.

10. **Out of scope.**
    - No changes to mainview's diff/changes/PR columns.
    - No new keyboard shortcuts.
    - No persisted user preference for hiding chips.
