---
title: "clean up the Style tab in the stages config. it seems redundant with some of the others. what can be removed?"
slug: clean-up-style-tab
updated: 2026-04-26
---

## Problem

The Style tab in the tracker stages configuration currently mixes true project-wide workflow preferences with settings that overlap stage-specific controls. That makes the UI harder to understand and creates multiple places that appear to control similar behavior.

## Why

If the same behavior is configurable from both the Style tab and an individual stage tab, users have to guess which setting wins or whether both matter. Cleaning that up should make stage configuration easier to reason about and reduce redundant prompts and generated guidance.

## Findings

- `requirements.style` and `requirements.detail` are already stage-specific and have distinct effects in generated requirements guidance.
- Global `inputMode` is intentionally shared across stages and is referenced explicitly from stage generation and the Style tab comments.
- Global `testing` overlaps with stage-specific `implement.tdd` and `cleanup.tests`.
- Global `commits` overlaps with stage-specific `implement.commit_style`.
- Global `contextDepth` is close to `discovery.effort` and partially overlaps `implement.start_with=explore`, though it still acts as a broader project-wide research preference.
- Global `planning` and `codeScope` are broad behavioral preferences, but they should be reviewed for whether they still add value now that stage tabs carry more concrete knobs.

## Recommendation

Remove the clearly redundant Style-tab controls first: `testing` and `commits`. Evaluate `contextDepth` next and either remove it or narrow its meaning so it no longer overlaps discovery and implementation exploration controls. Keep `decisionStyle`, `verbosity`, `questions`, `onBlockers`, `inputMode`, and `customInstructions` as global preferences. Treat `planning` and `codeScope` as follow-up review items unless code inspection shows they are unused or fully duplicated elsewhere.
