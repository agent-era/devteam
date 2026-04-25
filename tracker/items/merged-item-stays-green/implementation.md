---
title: "after a PR is merged, the item still shows up as green and ready"
slug: merged-item-stays-green
updated: 2026-04-25
---

## What was built

One line added in `TrackerBoardScreen.tsx` (item render loop): look up `getWorktreeForItem(item)?.pr?.is_merged` and short-circuit `readyToAdvance` to false when true. All downstream color, glyph, label, and hint logic already flows from `readyToAdvance`, so no other changes needed.

## Stage review

Trivial change — one guard added, no new dependencies, all pre-existing type errors unrelated to this fix.
