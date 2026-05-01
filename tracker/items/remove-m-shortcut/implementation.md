# remove-m-shortcut

## What was built
- Removed the kanban-only `m` shortcut from `useKeyboardShortcuts`.
- Removed the tracker board's advance handler and the `[m]` UI copy from the selected-card hint and footer.
- Added missing item notes and requirements files for the tracker entry.

## Key decisions
- Kept the ready-to-advance visual state intact; only the shortcut and its surrounding copy were removed.
- Left the rest of the board keyboard map unchanged so the change stays isolated.

## Stage review
Removed the kanban `m` advance shortcut from input handling and from the board UI copy, then verified the focused unit tests and typecheck pass. The board still shows the ready-to-advance state, but it no longer advertises a dedicated key for it.
