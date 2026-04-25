---
title: "after a PR is merged, the item still shows up as green and ready"
slug: merged-item-stays-green
updated: 2026-04-25
---

## Problem

After a PR is merged on GitHub, the corresponding tracker item remains green ("ready to advance") on the kanban board indefinitely, until the 24-hour staleness window expires.

## Why

When an agent completes cleanup it sets `status.json → state: "waiting_for_approval"`, making the item green. If the user merges the PR on GitHub directly (without pressing `[m]` on the board), `status.json` is never updated. The kanban's green logic reads only `status.json` — it never checks whether the worktree's PR has been merged — so the card stays green for up to 24 hours with no indication the work is done.

## Summary

When the kanban detects that an item's worktree PR has been merged, suppress the green "ready to advance" highlight — the item stays in its current stage but renders as plain/dim instead of highlighted green. No state is written, no automatic stage transition. The `TrackerBoardScreen` already has the worktrees list with `worktree.pr.is_merged`; the fix is a small condition in the existing color/glyph logic.

## Acceptance criteria

1. An item whose worktree PR is detected as merged does not render green, regardless of what `status.json.state` says.
2. Such an item renders as plain/dim — no green color, no `✓` glyph, no "Ready" label, no `[m] approve and advance` hint.
3. Items without a worktree, or whose PR status is not yet fetched, are unaffected (no crash, no change in appearance).
4. Items whose PR is not merged continue to show green when `state: "waiting_for_approval"` as before.
5. No `status.json` is written and no stage transition occurs — this is a rendering-only change.
