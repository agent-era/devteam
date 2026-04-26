---
title: "merged items on kanban arent showing merged status even though they shouldve in commit 3eb3e4d"
slug: merged-status-not-showing
updated: 2026-04-26
---

## Problem

Commit `3eb3e4d` ("Show subdued Merged label on completed tracker cards", PR #224) added a merged-state branch to the tracker board. In practice it never fires — items whose PRs are merged on GitHub keep showing their pre-merge state on the kanban.

## Why

`TrackerBoardScreen.tsx:759` reads `wt?.pr?.is_merged`, but `WorktreeInfo.pr` is declared in `models.ts` and **never assigned anywhere in production code**. PR data lives on `GitHubContext.pullRequests`, keyed by worktree path; the kanban screen doesn't consume that context at all. The worktree list view does it correctly via `pullRequests?.[worktree.path]`.

The same broken lookup also dead-letters the earlier "merged item stays green" fix from commit `95f7126` (PR #221) — both PRs have shipped silently broken since.

## Summary

Three coordinated changes in `src/screens/TrackerBoardScreen.tsx` plus a small `models.ts` cleanup:

1. **Fix the merged lookup.** Pull `pullRequests` from `useGitHubContext()` and compute `prMerged` as `pullRequests[wt.path]?.is_merged === true`. This unblocks both the new merged label and the earlier "stays green" guard in one shot.
2. **Scope kanban PR refreshes to the kanban.** Add a `setVisibleWorktrees(...)` effect on the tracker board, mirroring the worktree list. Pass the paths of worktrees currently mapped to kanban items (i.e. `sessionMap.values().map(w => w.path)`), so the auto-refresh interval only hits PRs the kanban actually displays — not whatever set the worktree list left in place.
3. **Delete the dead `pr` plumbing on `WorktreeInfo`.** Remove the `pr?: PRStatus` field plus the two getters that depend on it (`needs_attention`, `action_priority`) — both are never called from anywhere. Also strip the `worktree.pr = pr` assignments from `tests/utils/testHelpers.ts`, `tests/utils/testDataFactories.ts`, and the matching read in `tests/utils/renderApp.tsx`. The fakes already store PR data in `memoryStore.prStatus` keyed by path, so the actual data path through `FakeGitHubService → GitHubContext.pullRequests` keeps working — only the unused mirror on the worktree object goes away.

## Acceptance criteria

1. On the kanban, an item whose PR's GitHub state is `MERGED` renders with `◆ Merged` in gray (`getTrackerCardDisplayState`'s merged branch), regardless of the item's tracker stage or `status.json` state.
2. An item whose PR is merged does **not** render the green `✓ Ready` treatment, even if its `status.json` reports `waiting_for_approval` (the prior `merged-item-stays-green` behavior, now actually working).
3. While the kanban is mounted, `GitHubCore.visibleWorktrees` reflects the paths of worktrees backing kanban items — not whatever the previous screen set.
4. `WorktreeInfo.pr`, `WorktreeInfo.needs_attention`, and `WorktreeInfo.action_priority` are gone. No production reference to `worktree.pr` remains. Test utilities no longer assign `.pr`.
5. A new test covers the data path: when a fake worktree's PR (in `memoryStore.prStatus`) has state `MERGED`, the rendered kanban frame shows the merged indicator. This is the gap that hid the bug.
6. `npm run typecheck` and `npm test` both pass.
