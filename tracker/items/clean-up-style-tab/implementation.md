---
title: "clean up the Style tab in the stages config. it seems redundant with some of the others. what can be removed?"
slug: clean-up-style-tab
updated: 2026-04-26
---

Removed the redundant global Style-tab settings from the tracker work-style model and UI. The Style tab now keeps only the smallest set of cross-stage preferences that still have clear direct meaning in the generated guidance.

Key decisions:
- Removed global `testing`, `commits`, and `contextDepth` from `WorkStyle` and `DEFAULT_WORK_STYLE`.
- Removed the matching Style-tab rows from `TrackerStagesScreen`.
- Removed the corresponding sections from generated `working-style.md`, so the generated guidance no longer duplicates stage-specific controls.
- After review, also removed global `planning`, `questions`, `codeScope`, and `onBlockers` to keep the Style tab short and focused.
- The remaining Style-tab controls are `decisionStyle`, `verbosity`, `inputMode`, and `customInstructions`.

Notes for cleanup:
- Existing `work-style.json` files may still contain the removed keys, but loading remains backward-compatible because unknown JSON keys are ignored when merged into the current defaults.

## Stage review

Implemented the Style-tab reduction in two passes: first removed the clearly redundant stage-overlap controls, then reduced the remaining prompt-shaping globals so the tab stays short. Verified with `npm run typecheck` and `npm test -- --runInBand tests/unit/tracker.test.ts`.
