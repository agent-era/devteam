---
title: "when archiving and setting inactive, does it kill running shell and execute sessions?"
slug: archive-kills-sessions
updated: 2026-04-25
---

## What was built

Inactive-toggle behavior on the tracker board now terminates tmux sessions when an item is being marked inactive. The cleanup uses the same session naming scheme as archive behavior and kills the agent, `-shell`, and `-run` sessions when present.

## Key decisions

- Kept tracker metadata writes in `TrackerService`.
- Exposed tmux cleanup as a public `WorktreeCore` capability and routed the board action through `WorktreeContext`, so the screen does not instantiate or manipulate tmux directly.
- Only kill sessions on the active to inactive transition. Reactivation stays metadata-only.

## Cleanup notes

The board toggle still updates tracker ordering and persistence exactly as before. Archive behavior was left unchanged.

## Stage review

Implemented inactive-session cleanup by reusing the existing feature session naming contract and keeping the cross-layer responsibility split intact. Verified with a new focused unit test plus full typecheck, build, and the complete Jest suite.
