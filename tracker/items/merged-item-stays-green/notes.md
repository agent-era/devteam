---
title: "after a PR is merged, the item still shows up as green and ready"
slug: merged-item-stays-green
updated: 2026-04-25
---

## Problem

After a PR is merged on GitHub, the corresponding tracker item remains green ("ready to advance") on the kanban board indefinitely, until the 24-hour staleness window expires.

## Findings

**What drives the green color**

`TrackerBoardScreen.tsx:664–665` — an item is green when `service.isItemReadyToAdvance(itemStatus)` is true. That function (`TrackerService.ts:532–533`) returns true when `status.json` has `state: "waiting_for_approval"` and the timestamp is under 24 hours old (`ITEM_STATUS_STALE_MS = 24h`).

**How the typical path leads to the bug**

1. Agent completes cleanup and sets `status.json → state: "waiting_for_approval"` → item turns green.
2. User merges the PR directly on GitHub (skipping the `[m]` shortcut in the board).
3. GitHubCore polls GitHub every ~5 min and detects `PRStatus.state === 'MERGED'` (`models.ts:71`).
4. **Nothing connects that detection back to `status.json`.** The item stays green.
5. After 24 hours the staleness guard kicks in and the green disappears silently.

**PR merge detection exists but is disconnected**

- `WorktreeStatus.ts:41,91` — computes `PR_MERGED` reason when `worktree.pr.is_merged`.
- `MainView` uses this to render the worktree row as gray/dimmed — but only in the worktree list, not the kanban board.
- `TrackerBoardScreen` never checks `worktree.pr?.is_merged`; its item color logic reads only `status.json`.

**The `[m]` happy path works correctly**

When the user presses `[m]` on the board, `moveItem(slug, 'archive')` is called, which updates `index.json` and resets `status.json` to `state: "working"` (then the item moves to archive and disappears from the board). The bug only occurs when the PR is merged externally without using `[m]`.

**Available data to fix it**

`TrackerBoardScreen` already has access to the full `worktrees` array (each `WorktreeInfo` has `.feature` = item slug and `.pr.is_merged`). The fix can look up an item's worktree, check `pr.is_merged`, and suppress/clear the green state.

## Recommendation

Two-layer fix:

1. **Display layer (immediate, safe):** In the `isItemReadyToAdvance` call site inside `TrackerBoardScreen`, also check whether the item's worktree has a merged PR. If so, treat `readyToAdvance` as false — the item shouldn't be green after merge. This is a read-only change to rendering.

2. **Data layer (correct, one extra step):** When rendering detects a merged PR for a `waiting_for_approval` item, call `moveItem(slug, 'archive')` (or at minimum `writeItemStatus(…, {state: 'working'})`) so the tracker data reflects reality. This mirrors what `[m]` does manually.

The display fix alone stops the symptom. The data fix makes the board accurate durably (the item moves to archive, which is the expected outcome after a merge). Both changes belong in `TrackerBoardScreen.tsx`; no new infrastructure needed.
