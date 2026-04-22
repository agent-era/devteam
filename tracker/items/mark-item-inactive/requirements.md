---
title: "make a way to not archive, but mark an item as inactive so it shows up grayed at the bottom. and pressing the same key will activate it again. this is for the kanban board"
slug: mark-item-inactive
updated: 2026-04-22
---

## Problem

The tracker kanban currently has two visibility modes for items: active on the board, or archived out of the active flow. There is no lighter-weight way to keep an item around but visually de-emphasized.

## Why

Some items should stay visible for context and later reactivation without being treated as completed or removed from the working board. Archiving is too strong for that use case.

## Summary

Add a board-level inactive state for tracker items. Inactive items remain in their existing workflow stage, persist in `tracker/index.json` as item metadata, render dimmed at the bottom of their current kanban column, and can be toggled back to active with the same dedicated keyboard shortcut used to inactivate them.

## Acceptance criteria

1. The tracker persists an inactive flag for individual items in `tracker/index.json` without changing their stage or archive status.
2. Loading the tracker board keeps inactive items in their current column but sorts them after active items in that same column.
3. Relative order among active items remains stable, and relative order among inactive items remains stable.
4. Inactive items render visually grayed or dimmed on the kanban board while remaining selectable.
5. The tracker board exposes a dedicated keyboard shortcut to toggle the selected item between active and inactive.
6. Pressing that shortcut on an active item marks it inactive immediately and updates the board without requiring archive flow.
7. Pressing that same shortcut on an inactive item restores it to active immediately and returns it to the active group in its current column.
8. Existing archive behavior remains available separately and is not silently triggered by the inactive toggle.
9. Items without an inactive flag continue to behave exactly as active items do today.
10. Ralph's phase-automation nudger skips worktrees whose tracker item is inactive, so inactive items are not nudged even when they meet every other nudge guard.
