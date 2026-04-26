---
title: "items should show which of the agent, session, execution are running. similar to the mainview. maybe use the same kind of 'chips' with colored bgs"
slug: running-status-chips
updated: 2026-04-26
---

## Problem

Tracker board cards don't show which of the three tmux sessions (agent / shell / execution) are actually running for an item. The mainview already exposes this with the `[a] [s] [x]` chips, but the kanban only shows a single status glyph (✓ / ! / ⟳ / ◆ / blank), which collapses three independent flags into one.

## Why

A user scanning the kanban can't tell at a glance whether a card has only an agent attached, only a shell, both, plus a run session, etc. That's information they already get on the worktree list and would expect to see on the board, especially when triaging which item to attach to.

## Summary

Add a per-card "running" mini-row to `TrackerBoardScreen` that renders one labeled, colored chip per active tmux session — `agent` (cyan), `shell` (green), `run` (magenta) — using the same `getWorktreeForItem` linkage the board already builds. The row is active-only: hidden when the item has no linked worktree, and hidden again when all three session flags are false. The existing `◆` "has session" status glyph is dropped because the chips communicate the same thing more precisely; the other status glyphs (`✓` / `!` / `⟳`) remain since they convey ralph/AI state, not session presence.

## Acceptance criteria

1. A tracker card on `TrackerBoardScreen` whose linked worktree has `session.attached === true` renders a chip labeled `agent` with a cyan (`cyan`) background and white foreground.
2. A tracker card whose linked worktree has `session.shell_attached === true` renders a chip labeled `shell` with a green (`green`) background and white foreground.
3. A tracker card whose linked worktree has `session.run_attached === true` renders a chip labeled `run` with a magenta (`magenta`) background and white foreground.
4. Chips render in fixed order — `agent`, `shell`, `run` — with a single space between adjacent chips. Inactive sessions are omitted (no placeholder chip, no bracketed `[a]/[s]/[x]` form).
5. The chip row is rendered as a dedicated line directly beneath the slug row and above the existing secondary/description text. It is indented to the same `    ` (four-space) gutter the secondary lines already use.
6. The chip row is hidden entirely when no worktree is linked to the item (i.e., `getWorktreeForItem(item)` returns `undefined`).
7. The chip row is hidden entirely when a worktree is linked but all three of `attached`, `shell_attached`, `run_attached` are false.
8. Chip backgrounds remain at their session colors regardless of whether the card is currently selected — mirroring how `SessionCell` keeps `#005f87` for active sessions across selection states. The slug row's existing selection/inverse treatment is unchanged.
9. The `◆` "has session" branch of the existing status-glyph logic in `TrackerBoardScreen.tsx` is removed: when the only positive signal would have been `hasSession`, the glyph cell renders a space (as it already does for fully-inactive cards). The `✓`, `!`, and `⟳` branches and their associated colors are unchanged.
10. The wider behavior of `getSessionForItem` (used elsewhere on the board for ralph/AI status decisions) is untouched. The chip row uses `getWorktreeForItem` so a worktree with `ai_status === 'not_running'` but a live shell or run session still surfaces its chips.
11. Unit / e2e tests cover: (a) all three sessions active → all three chips render in order; (b) only `shell_attached` → only the `shell` chip renders; (c) no linked worktree → no chip row in the card output; (d) worktree linked but no sessions → no chip row.
12. `npm test` and `npm run typecheck` both pass.
