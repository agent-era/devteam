# remove-m-shortcut

## Problem
The kanban board still binds `m` to advance the selected item and advertises that shortcut in the board UI. That leaves a shortcut in place that should no longer exist and makes the board's action hints inconsistent with the intended interaction model.

## Why
The board is already the place where readiness is shown, so the view should not promise a one-key advance action that users are not meant to rely on. Removing the shortcut also avoids one more path that can advance an item from the kanban by accident.

## Summary
Remove the kanban-specific `m` shortcut from keyboard handling and from the board footer/hint copy. The board should still render ready-to-advance items normally, but it should not advertise or respond to `m` as an advance action.

## Acceptance criteria
1. Pressing `m` on the kanban board no longer advances the selected item.
2. The kanban footer no longer lists `m` as an available shortcut.
3. Ready-to-advance cards still render their green state, but the selected-card hint no longer says to press `m`.
4. No other keyboard shortcuts on the board change as a result of this removal.
