# Discovery — running-status-chips

## Problem

Tracker board cards don't show which of the three tmux sessions (agent / shell / execution) are actually running for an item. The mainview already exposes this with the `[a] [s] [x]` chips, but the kanban only shows a single status glyph (✓ / ! / ⟳ / ◆ / blank), which collapses three independent flags into one.

## Why

A user scanning the kanban can't tell at a glance whether a card has only an agent attached, only a shell, both, plus a run session, etc. That's information they already get on the worktree list and would expect to see on the board, especially when triaging which item to attach to.

## Findings

### Existing chip pattern (mainview)
- The a/s/x indicators in MainView are *not* `StatusChip` — they're rendered by `renderSessionCell()` in `src/components/views/MainView/SessionCell.tsx:7-27`.
- Active: solid `#005f87` blue bg, bold white ` a `/` s `/` x `.
- Inactive: dimmed `[a]/[s]/[x]` brackets (or inverted on selected/dimmed rows).
- WorktreeRow wires three flags from `worktree.session`: `attached` (agent), `shell_attached` (shell), `run_attached` (run/execution) — `WorktreeRow.tsx:63-65`.

### Data linkage already exists on the board
- `TrackerBoardScreen.tsx:146-159` builds `sessionMap: slug → WorktreeInfo`. Tracker item slug == worktree feature name.
- `getWorktreeForItem(item)` returns the linked WorktreeInfo regardless of AI status.
- `getSessionForItem(item)` is the *filtered* version (only when `ai_status !== 'not_running'`) — used for the existing ◆/⟳/! glyph logic.
- For chips we want the unfiltered `getWorktreeForItem` so a shell-only or run-only worktree still lights up s/x even when the agent is idle.

### Card layout & space budget
- Cards are columns; column width is variable but tight. Slug row currently eats ~8 chars: `▸ ` + glyph + space + slug. `TrackerBoardScreen.tsx:677-678`.
- Three SessionCell-style chips at width 3 each = 9 chars (or 6 if we tighten to ` a ` without bracket padding for inactive).
- Two reasonable placements: (a) next to the slug on the same row (eats more of the slug width); (b) dedicated mini-row beneath the slug, before/replacing the secondary description line for cards with sessions.

### Open design questions (for requirements stage)
1. Placement: same row as slug, or dedicated row?
2. When no worktree is linked (item never had a session): hide chips entirely, or show three dim placeholders?
3. Coexistence with existing status glyph (✓/!/⟳/◆): keep both, or do chips subsume ◆ ("has session")?

## Recommendation

Reuse `renderSessionCell` directly (it's the same primitive the mainview uses, so visual consistency is free). Render in a dedicated mini-row right under the slug, only when the item has a linked worktree. Keep the existing ✓/!/⟳ status glyph since it conveys ralph/AI state, but drop the redundant ◆ glyph (chips communicate "session present" more precisely). These are tentative; will confirm in requirements.
