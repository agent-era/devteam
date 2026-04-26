---
title: "merged item should have some indicator in the kanban view"
slug: merged-indicator-kanban
updated: 2026-04-26
---

## Problem

Merged items on the tracker kanban do not have a distinct merged indicator. The prior fix for merged PRs only removed the misleading green "ready" treatment; it did not add any positive merged-state signal on the card itself.

## Why

After a PR is merged, the card should communicate that state directly in the kanban view. Without that signal, merged items look like ordinary idle items, which makes the board harder to scan and leaves users unsure whether a card is still actionable.

## Summary

Add an explicit merged presentation to tracker kanban cards when the matching worktree PR is merged. The card should show the text `Merged`, use subdued styling rather than an attention-grabbing color, and suppress the green ready-to-advance treatment even if the item's `status.json` still says `waiting_for_approval`. The change should stay local to the tracker board rendering path and include test coverage for the merged-state behavior.

## Acceptance criteria

1. When a tracker item's matching worktree has `pr.is_merged === true`, its kanban card shows an explicit `Merged` indicator in the card UI.
2. The merged indicator uses subdued styling consistent with the existing merged treatment in the worktree list, rather than green ready-state styling.
3. A merged item never renders with the green ready-to-advance visual treatment or approve hint, even if its fresh `status.json` state is still `waiting_for_approval`.
4. The merged indicator logic is driven from the existing worktree PR data already available to `TrackerBoardScreen`, without requiring new tracker metadata or a service-layer schema change.
5. Non-merged items keep their existing rendering behavior for ready, waiting, working, idle, inactive, and session-backed states.
6. Automated test coverage verifies that merged items render `Merged` and do not render the ready-state treatment in the tracker board.
