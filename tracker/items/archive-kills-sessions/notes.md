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

## Findings

- Archive confirmation routes to `WorktreeCore.archiveFeature()` for normal worktrees ([src/screens/ArchiveConfirmScreen.tsx](/home/mserv/projects/devteam-branches/archive-kills-sessions/src/screens/ArchiveConfirmScreen.tsx:51), [src/cores/WorktreeCore.ts](/home/mserv/projects/devteam-branches/archive-kills-sessions/src/cores/WorktreeCore.ts:342)).
- Before moving the worktree, `archiveFeature()` calls `terminateFeatureSessions()`, which explicitly kills three tmux sessions if present: the main agent session, the `-shell` session, and the `-run` session ([src/cores/WorktreeCore.ts](/home/mserv/projects/devteam-branches/archive-kills-sessions/src/cores/WorktreeCore.ts:348), [src/cores/WorktreeCore.ts](/home/mserv/projects/devteam-branches/archive-kills-sessions/src/cores/WorktreeCore.ts:582)).
- Marking an item inactive is tracker-only metadata. `TrackerService.setItemInactive()` / `toggleItemInactive()` only update `tracker/index.json` and never call tmux or worktree cleanup code ([src/services/TrackerService.ts](/home/mserv/projects/devteam-branches/archive-kills-sessions/src/services/TrackerService.ts:417), [src/services/TrackerService.ts](/home/mserv/projects/devteam-branches/archive-kills-sessions/src/services/TrackerService.ts:427)).
- Existing inactive tests only verify persistence of the `inactive` flag; they do not assert any session cleanup side effect ([tests/unit/tracker.test.ts](/home/mserv/projects/devteam-branches/archive-kills-sessions/tests/unit/tracker.test.ts:574)).

## Recommendation

Treat these as intentionally different today:
- Archiving does kill running shell and execute sessions, along with the main agent session.
- Setting inactive does not kill any tmux sessions; it only changes board state.

If the desired product behavior is for inactive to also stop shell/run sessions, that is a feature gap rather than a bug in the current archive flow.
