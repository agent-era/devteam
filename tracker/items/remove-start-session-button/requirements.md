---
title: "remove the \"start x session\" button from the item details screen, because now sessions are created on item creation. instead, there should be a button to attach/ or continue session without sending anything to it"
slug: remove-start-session-button
updated: 2026-04-20
---

## Problem

The item details screen (`src/screens/TrackerItemScreen.tsx:42`) shows a `Start {stage} session` action that calls `handleCurrentStageWork` → `launchSessionForItem` (`src/App.tsx:251`), which attaches the tmux session **and sends an initial planning prompt** built from the stage config.

Since item creation now auto-creates the session in the background (`launchSessionForItemBackground`, `src/App.tsx:267`), this button's prompt-sending behavior is redundant and, worse, re-sends the stage prompt every time the user opens the item — polluting the running agent. The user just wants to jump into the already-running session.

## Why

The `Start {stage} session` flow was designed back when sessions were started lazily from the item screen. Item-creation-time session launch (#213) moved that responsibility earlier, so the button's prompt-sending side-effect is now a bug, not a feature. The only behavior the user still needs from that action is "put me in front of the running agent". The stage-advance action is untouched — it still needs its prompt because it represents a *state change* to a new stage.

## User stories

- As a user viewing a tracker item whose session is already running, I want to press one action to **attach** to that session without re-sending the stage planning prompt, so I can continue the existing agent conversation without polluting it.
- As a user viewing a tracker item whose session was killed or never started (e.g. creation-time background launch failed), I want the same action to **create/start** the session on demand — still without sending a planning prompt — so I have a reliable single button that always lands me in the agent pane.

## Summary

Remove the `Start {stage} session` action from `TrackerItemScreen` and replace it with an **Attach session** action that calls `attachSession(worktree)` with **no `initialPrompt`**. This mirrors the attach-only pattern already in use at `src/screens/TrackerBoardScreen.tsx:241` and `src/screens/WorktreeListScreen.tsx:125`. Because `createSessionIfNeeded` is idempotent, the same action covers both the "session already running → just attach" and "session missing → create then attach" cases, without a separate UI affordance. The stage-advance action (`stage-action`) is **not** modified — it still sends the next-stage planning prompt on promotion. Any now-unused helpers (`launchSessionForItem`, `buildPromptForItem` for the current-stage path) are cleaned up.

## Acceptance criteria

1. `src/screens/TrackerItemScreen.tsx` no longer renders an action labelled `Start {stage} session`. It renders an action labelled **`Attach session`** instead, in the same slot (first action, left of the stage-advance button).
2. Activating the `Attach session` action attaches the user to the tracker item's worktree agent tmux session **without sending any initial prompt** — the running agent sees no new input as a result of the button press.
3. If the worktree does not exist on disk (e.g. archived/deleted), the action recreates it (reusing the existing `recreateImplementWorktree` path) before attaching. If recreation fails, the user is routed back to the tracker board, matching current failure behavior.
4. If the worktree exists but the tmux agent session does not exist, the action creates the tmux session (no prompt, using the project's remembered AI tool) and attaches. If no AI tool has been selected yet for this worktree, the AI-tool-selection flow is shown (matching the current `needsToolSelection` path) and proceeds with an empty `initialPrompt`.
5. The stage-advance action (`stage-action`, label from `currentConf.actionLabel`) continues to send the next-stage planning prompt on promotion — its behavior is unchanged.
6. `prepareItemSession`, `launchSessionForItem`, and any other helpers that exist solely to build and send the current-stage planning prompt are removed if no other call site uses them; otherwise the current-stage path is removed from `App.tsx` and the helpers that remain in use for stage-advance are left alone.
7. `onCurrentStageWork` prop in `TrackerItemScreen` is renamed to `onAttachSession` (or equivalent) to reflect the new behavior. Its handler in `App.tsx` calls `attachSession` with no prompt.
8. `npm run typecheck` passes. Existing Jest tests pass. New coverage: a unit/E2E test verifying that activating the Attach action calls `attachSession` (or the fake equivalent) with `initialPrompt` undefined/empty.
9. No change to the stage/exit-criteria display, the scrollable content area, or keyboard shortcuts on this screen.
