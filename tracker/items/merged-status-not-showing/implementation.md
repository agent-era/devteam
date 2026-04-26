---
title: "merged items on kanban arent showing merged status even though they shouldve in commit 3eb3e4d"
slug: merged-status-not-showing
updated: 2026-04-26
---

## What was built

Three coordinated changes plus a dead-code cleanup.

**1. Fixed the merged lookup (`src/screens/TrackerBoardScreen.tsx`).** The kanban now reads PR status from `useGitHubContext().pullRequests` keyed by `wt.path`, replacing the broken `wt?.pr?.is_merged` lookup. Pulled the lookup into a small exported helper `isItemPRMerged(worktree, pullRequests)` so the data path is unit-testable and can't silently regress. As a side effect this also restores the earlier "merged item stays green" guard (PR #221), which used the same broken `wt.pr.is_merged` field and was dead-lettered too.

**2. Scoped kanban PR refreshes to the kanban (same file).** Added a `setVisibleWorktrees(...)` effect that publishes the paths of worktrees backing kanban items (derived from `sessionMap`, which is already project-scoped and includes orphan worktrees). Membership is collapsed to a sorted-joined key string so the effect only re-fires when the *set* of paths changes, not on every re-render.

**3. Deleted the dead `pr` plumbing on `WorktreeInfo` (`src/models.ts`).** Removed the `pr?: PRStatus` field — it was declared but never assigned in production code. Two getters that depended on it (`needs_attention`, `action_priority`) were also unused — deleted them. Updated `formatPRStatus` and `shouldDimRow` in `src/components/views/MainView/utils.ts` to type their `pr` parameter as `PRStatus | undefined | null` directly instead of via the dropped `WorktreeInfo['pr']` indexed type.

**4. Test infrastructure follow-up.** Stripped the matching `worktree.pr = pr` mirror writes and `pr: new PRStatus()` constructor entries from `tests/utils/testHelpers.ts`, `tests/utils/testDataFactories.ts`, `tests/fakes/FakeGitService.ts`, `tests/fakes/stores.ts`, and the `tests/e2e/archived.test.tsx` / `tests/e2e/data-flow.test.tsx` / `tests/e2e/unarchive-workflow.test.tsx` fixtures. The mock renderer's archived view (`tests/utils/renderApp.tsx`) now reads PR data from `memoryStore.prStatus` keyed by path, mirroring the real production path through `FakeGitHubService → GitHubContext.pullRequests`. The handful of tests that actually assert on PR-derived rendering now seed `memoryStore.prStatus.set(path, pr)` directly.

## Key decisions

- **Helper extraction over inline lookup.** The lookup itself is one line, but the two prior fixes silently broke for the same reason. Naming it `isItemPRMerged` and pinning it with unit tests (including a test that explicitly proves the helper does *not* read `wt.pr`) is the smallest change that prevents the third repeat.
- **Removed the dead field instead of fixing it in place.** With the field gone, there is no longer a `wt.pr` for a future contributor to mistake for the canonical source. The two unused `needs_attention` / `action_priority` getters that depended on it were dead too, so they came along.
- **Re-derived kanban-visible worktrees from `sessionMap` rather than re-walking `board.columns`.** `sessionMap` is already the project-scoped set of worktrees the kanban knows about, and the orphan-splicing logic adds orphan worktrees back into the board, so the values are equivalent. Avoids a redundant nested loop on every render.
- **Did not touch the dead `'archived'` UI mode in the mock renderer.** `setUIMode('archived')` and the corresponding tests in `tests/e2e/archived.test.tsx` exercise a hand-rolled mock UI that has no production counterpart, but ripping it out is outside the scope of this fix. Updating the mock to read PRs from the same store production uses keeps it honest without expanding scope.

## Notes for cleanup

- All 750 jest tests pass; all 281 terminal tests pass; `npm run typecheck` is clean.
- Manual verification of the kanban merged label requires a project with a tracker item whose PR is merged on GitHub but whose worktree is still active (not yet archived). On `devteam`/main today, that includes `terminal-ui-state-detection`, `requirements-in-worktree`, `running-status-chips` — all in the cleanup column with merged PRs.
- The new `tests/unit/TrackerBoardScreen.test.ts` file now also covers `isItemPRMerged`. The pure-function `getTrackerCardDisplayState` tests from PR #224 are untouched.
