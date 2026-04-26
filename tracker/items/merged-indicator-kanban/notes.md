---
title: "merged item should have some indicator in the kanban view"
slug: merged-indicator-kanban
updated: 2026-04-26
---

## Problem

Merged items on the tracker kanban do not have a distinct merged indicator. The prior fix for merged PRs only removed the misleading green "ready" treatment; it did not add any positive merged-state signal on the card itself.

## Findings

`TrackerBoardScreen.tsx` already reads merged PR state from the matching worktree:

- `getWorktreeForItem(item)?.pr?.is_merged === true` is computed in the item render loop.
- That value is currently used only to suppress `readyToAdvance` (`src/screens/TrackerBoardScreen.tsx:660-661`).

What the board renders today for a merged item:

- No merged-specific glyph.
- No merged-specific color.
- No merged-specific secondary label.
- The card falls back to the normal non-ready rendering path, which usually shows `worktree exists`, `has impl notes`, `running`, `session idle`, or nothing.

This means the earlier archived item `merged-item-stays-green` solved a narrower bug:

- It stopped merged PRs from staying green after an external GitHub merge.
- It did not add a durable merged indicator to the kanban card.

Relevant implementation shape:

- `TrackerBoardScreen.tsx` already has the right data at render time, so this looks like a local presentation change rather than a service or model gap.
- `MainView/WorktreeRow.tsx` already has a merged visual treatment on the worktree list side (`StatusReason.PR_MERGED` maps to gray), so there is an existing product precedent for using a subdued merged state instead of a high-attention color.
- I did not find tracker-board tests that assert merged rendering specifically, so this gap is likely untested today.

## Recommendation

Treat this as a focused tracker-board rendering change.

Recommended direction:

1. Add an explicit merged state branch in `TrackerBoardScreen.tsx` ahead of the generic idle path.
2. Render a merged-specific glyph and label on the card, likely in gray/dimmed styling to match the worktree list precedent.
3. Keep the existing behavior that suppresses the green ready state for merged PRs.
4. Add a tracker-board test that proves a merged PR shows the merged indicator and does not show the ready treatment.

Open requirement to settle in the next stage: whether the merged indicator should be glyph-only, text-only (`Merged`), or both.
