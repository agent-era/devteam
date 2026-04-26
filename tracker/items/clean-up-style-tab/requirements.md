---
title: "clean up the Style tab in the stages config. it seems redundant with some of the others. what can be removed?"
slug: clean-up-style-tab
updated: 2026-04-26
---

## Problem

The Style tab in the tracker stages configuration currently mixes true project-wide workflow preferences with settings that overlap stage-specific controls. That makes the UI harder to understand and creates multiple places that appear to control similar behavior.

## Why

If the same behavior is configurable from both the Style tab and an individual stage tab, users have to guess which setting wins or whether both matter. Cleaning that up should make stage configuration easier to reason about and reduce redundant prompts and generated guidance.

## Summary

Simplify the Style tab so it contains only project-wide agent preferences. Remove the controls that are already represented more concretely on individual stage tabs, starting with global testing and commit preferences. Review the remaining borderline fields and either keep them with a clearly global meaning or remove them if they are effectively duplicates of per-stage controls.

## Acceptance criteria

1. The implementation identifies which current Style-tab fields are retained as global preferences and which are removed as redundant.
2. The implementation removes global `testing` because its behavior is already covered by `implement.tdd` and `cleanup.tests`.
3. The implementation removes global `commits` because its behavior is already covered by `implement.commit_style`.
4. The implementation explicitly decides the fate of global `contextDepth`, documenting whether it is removed or kept with a narrowed, clearly distinct meaning from `discovery.effort` and `implement.start_with`.
5. The implementation keeps global controls that still have genuinely cross-stage meaning, including `decisionStyle`, `verbosity`, `questions`, `onBlockers`, `inputMode`, and `customInstructions`, unless code inspection proves one of them unused.
6. The implementation updates generated guidance, defaults, and any affected tests so the tracker UI and generated stage skill no longer describe removed Style-tab settings.
7. The implementation does not remove `requirements.style` or `requirements.detail`, because those are stage-specific controls with distinct tested behavior.
