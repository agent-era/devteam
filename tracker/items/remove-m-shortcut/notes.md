# remove-m-shortcut

## Problem
The kanban board still binds `m` to advance the selected item and advertises that shortcut in the board UI. That leaves a shortcut in place that should no longer exist and makes the board's action hints inconsistent with the intended interaction model.

## Why
The board is already the place where readiness is shown, so the view should not promise a one-key advance action that users are not meant to rely on. Removing the shortcut also avoids one more path that can advance an item from the kanban by accident.

## Findings
- `src/hooks/useKeyboardShortcuts.ts` still dispatched `m` to the board-specific advance action.
- `src/screens/TrackerBoardScreen.tsx` still wired that action and showed `[m] to approve and advance` in the selected-card hint, plus `m advance` in the footer.
- No other help copy in this repo advertised the shortcut, so the change is localized to the kanban board.

## Recommendation
Remove the kanban `m` binding and all board copy that mentions it, then verify the ready-to-advance state still renders without a shortcut hint.
