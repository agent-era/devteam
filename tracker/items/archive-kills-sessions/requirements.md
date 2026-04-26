---
title: "when archiving and setting inactive, does it kill running shell and execute sessions?"
slug: archive-kills-sessions
updated: 2026-04-25
---

## Problem

Determine whether two different actions have the same tmux cleanup behavior:
- archiving a feature/workspace item
- marking a tracker item inactive

## Why

Inactive items should behave like archived items from a session-lifecycle perspective so stale shell and run sessions do not keep running after the item is intentionally taken out of active work.

## Summary

When a tracker item is toggled from active to inactive, the app should terminate any tmux sessions associated with that item's worktree, matching the existing archive behavior for agent, shell, and run sessions. Reactivating an inactive item should remain metadata-only and must not recreate or terminate sessions.

## Acceptance criteria

1. Toggling a tracker item from active to inactive kills the main tmux session for that item's `project/slug` if it exists.
2. Toggling a tracker item from active to inactive also kills the matching `-shell` and `-run` tmux sessions if they exist.
3. Toggling a tracker item from inactive back to active does not kill or create any tmux sessions.
4. Archiving behavior remains unchanged: archive still kills the same three session variants before moving the worktree.
5. The inactive flag continues to be persisted in `tracker/index.json`, and existing inactive ordering on the tracker board is preserved.
6. Automated tests cover the inactive toggle path and verify session cleanup behavior.
