---
title: "merged item should have some indicator in the kanban view"
slug: merged-indicator-kanban
updated: 2026-04-26
---

## What was built

Added an explicit merged-card presentation to `TrackerBoardScreen.tsx`. Merged items now render subdued gray `Merged` secondary text and do not show the green ready-to-advance treatment or approve hint, even if `status.json` is still `waiting_for_approval`.

The rendering decision was factored into `getTrackerCardDisplayState()` so the merged branch and the pre-existing ready branch can be tested directly without spinning up the full tracker board UI.

## Key decisions

- Kept the change local to tracker-board rendering; no tracker schema or service changes.
- Matched the existing worktree-list precedent by using a subdued gray merged treatment rather than a high-attention color.
- Preserved non-merged ready/waiting/working behavior unchanged.

## Notes for cleanup

- Added `tests/unit/TrackerBoardScreen.test.ts` to lock in the merged-state rendering and the non-merged ready-state fallback.

## Stage review

Implemented the merged indicator as a small presentation-only change in the board render path and added direct regression coverage for the new merged-state branch. Validation passed with the focused unit test, `npm run typecheck`, `npm test`, and `npm run test:terminal`.
