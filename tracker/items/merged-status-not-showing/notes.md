---
title: "merged items on kanban arent showing merged status even though they shouldve in commit 3eb3e4d"
slug: merged-status-not-showing
updated: 2026-04-26
---

## Problem

Commit `3eb3e4d` ("Show subdued Merged label on completed tracker cards", PR #224) added a merged-state branch to the tracker board: when an item's PR is merged, the card should render `◆ Merged` in gray. In practice, no merged item ever renders that way — items whose PRs are merged on GitHub keep showing their pre-merge state on the kanban.

## Findings

The merged-state code path is wired to a field that is never populated on `WorktreeInfo`.

`src/screens/TrackerBoardScreen.tsx:759` computes the merged flag like this:

```ts
const wt = getWorktreeForItem(item);          // returns a WorktreeInfo from the worktrees array
...
const prMerged = wt?.pr?.is_merged === true;  // <-- wt.pr is never set
```

But PR data lives in a separate context:

- `WorktreeInfo` has an *optional* `pr?: PRStatus` field declared in `src/models.ts:127`, but **nothing assigns to it**. A repo-wide grep for `\.pr =` returned no hits, and `pr:` only appears in unrelated table-column-width code.
- PR status is owned by `GitHubCore` / `GitHubContext`. It is exposed as `pullRequests: Record<string, PRStatus>` keyed by **worktree path**, plus a `getPRStatus(worktreePath)` accessor (`src/contexts/GitHubContext.tsx:7`, `src/cores/GitHubCore.ts:123`).
- The worktree list view consumes it correctly: `MainView.tsx:155` passes `prStatus={pullRequests?.[worktree.path]}` into `WorktreeRow`. The kanban does not consume `GitHubContext` at all.

Net effect: `wt?.pr` is always `undefined` on the kanban, so `prMerged` is always `false`. Every code path guarded by `prMerged` is dead:

1. The new merged label/glyph from `3eb3e4d` (the `prMerged` branch in `getTrackerCardDisplayState`).
2. The earlier "merged item stays green" fix from commit `95f7126` (PR #221), which used the exact same `getWorktreeForItem(item)?.pr?.is_merged` lookup to suppress the green ready treatment after a merge. That fix has been silently broken since it shipped.

This is consistent with the user's observation: items currently in the cleanup column whose PRs are already merged on GitHub (`terminal-ui-state-detection` #228, `requirements-in-worktree` #227, `running-status-chips` #225) show up without the merged indicator.

The unit tests added in `tests/unit/TrackerBoardScreen.test.ts` exercise `getTrackerCardDisplayState` with `prMerged: true` passed in directly, so they pass without touching the broken wiring. No test covers the path from worktree → PR data → display state.

## Recommendation

Treat this as a small wiring fix in `TrackerBoardScreen.tsx`:

1. Pull `pullRequests` (or `getPRStatus`) from `useGitHubContext()` in the kanban screen.
2. Replace `wt?.pr?.is_merged` with a lookup keyed by `wt.path`, e.g. `pullRequests[wt.path]?.is_merged === true` (or `getPRStatus(wt.path).is_merged`).
3. Verify the same `prMerged` value also feeds the existing `readyToAdvance` short-circuit, so the prior "stays green" fix starts working again as a side effect.
4. Add a test that goes through the full board render and asserts the merged label shows when `pullRequests[wt.path].state === 'MERGED'` — this is the gap that hid the bug last time.

Optional: consider whether `WorktreeInfo.pr` should be removed, since it is declared but never populated and is the trap that two PRs have already fallen into.
