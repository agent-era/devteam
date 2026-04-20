---
title: Split DiffView.tsx (1302 lines) into focused subcomponents — Discovery
slug: split-diffview-tsx-1
updated: 2026-04-19
---

## User problem

**Who**: Developers working on devteam itself (the user is the maintainer).

**Pain**: `DiffView.tsx` is 1302 lines with no internal structure — one React component holding ~25 `useState` hooks alongside async diff loading, side-by-side conversion, comment formatting, keyboard handling, and rendering of two view modes. Recent diff features (syntax highlighting, gutter colours, header styling) all landed in this one file, and the next feature will too unless it's split.

Concrete consequences:
- Finding any specific behaviour requires scanning unrelated code
- Pure functions (`loadDiff`, `convertToSideBySide`, `formatCommentsAsPrompt`) can't be unit-tested in isolation cleanly because they share a module with the React component and its imports
- State changes can ripple unpredictably; risk of regressions on every change

## Recommendation

Split along the natural seams already present in the file:

1. **`utils/diff/loadDiff.ts`** — `loadDiff()` (async git invocation + parsing). Pure, easy to test.
2. **`utils/diff/convertToSideBySide.ts`** — `convertToSideBySide()`. Already pure.
3. **`utils/diff/formatCommentsAsPrompt.ts`** — already exported, just move it.
4. **`types/diff.ts`** — `DiffLine`, `SideBySideLine`, `ViewMode`, `WrapMode`.
5. **`components/views/diff/UnifiedDiffRows.tsx`** — rendering for unified mode.
6. **`components/views/diff/SideBySideDiffRows.tsx`** — rendering for side-by-side mode.
7. **`hooks/useDiffNavigation.ts`** — selection, scrolling, file/hunk navigation, keyboard handling.
8. **`hooks/useDiffComments.ts`** — comment store integration + dialog state.
9. **`DiffView.tsx`** — slimmed-down orchestrator: load diff, hold top-level state, route between view-mode components and dialogs.

Target: orchestrator <300 lines; each extracted module <250 lines.

**Pure refactor — no behaviour change.** Existing tests must continue to pass; new tests added for the extracted pure functions. Do this in a single PR (atomic move) rather than incrementally, since the boundaries are clear and partial extraction would leave the file in an awkward in-between state.
