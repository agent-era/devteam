---
title: "clean up the Style tab in the stages config. it seems redundant with some of the others. what can be removed?"
slug: clean-up-style-tab
updated: 2026-04-26
---

Removed the redundant global Style-tab settings from the tracker work-style model and UI. The Style tab now keeps only cross-stage preferences, while test, commit, and research controls remain expressed through their stage-specific settings.

Key decisions:
- Removed global `testing`, `commits`, and `contextDepth` from `WorkStyle` and `DEFAULT_WORK_STYLE`.
- Removed the matching Style-tab rows from `TrackerStagesScreen`.
- Removed the corresponding sections from generated `working-style.md`, so the generated guidance no longer duplicates stage-specific controls.
- Kept `planning` and `codeScope` because they still express project-wide behavior that is not directly replaced by a single stage setting.

Notes for cleanup:
- Existing `work-style.json` files may still contain the removed keys, but loading remains backward-compatible because unknown JSON keys are ignored when merged into the current defaults.

## Stage review

Implemented the approved cleanup by removing the redundant global Style-tab controls for testing, commits, and research depth. Verified with `npm run build`, `npm run typecheck`, and `npm test -- --runInBand tests/unit/tracker.test.ts`.
