---
title: Ralph-like phase automation — implementation notes
slug: ralph-phase-automation
updated: 2026-04-20
---

## What was built

Four interlocking pieces, shipped as three commits on this branch:

1. **`fdd9cf8` — Foundation.** `ItemStatus` schema, `TrackerService`
   helpers (`getItemStatus`, `writeItemStatus`, `isItemStatusStale`,
   `getItemStatusPath`), `ITEM_STATUS_STALE_MS = 24h`. Loose schema
   validation + 120-char `brief_description` clamp. 9 unit tests.

2. **`910d40b` — Stage protocol + new settings.** Every generated
   stage guide now appends a common "Agent status protocol" section
   that tells the agent to keep `status.json` current on every
   transition. Three new settings expose in `TrackerStagesScreen`:
   - `input_mode`: `ask_questions | inline | batch | doc_review`
   - `gate_on_advance`: `none | review_and_advance | wait_for_approval`
   - `submit` (cleanup only): `auto | approve`
   `TrackerService.getItemStage` now prefers `status.json` and falls
   back to legacy `index.json` buckets. `moveItem` mirrors the new
   stage into `status.json`. New `listItemsByStage()` helper.

3. **`b68841e` — Runtime + UI.** `src/cores/RalphCore.ts` with
   per-worktree sampling loop (min 60s between samples), idle-window
   tracking, cap logic, reset-on-stage-change / reset-on-fresh-wait,
   stage-aware nudge text via `TmuxService.sendText`, append-only
   `logs/ralph.log`. Per-project config at `tracker/ralph.json`
   (`enabled`, `idleThresholdMs`, `maxNudgesPerStage`). New "Ralph"
   tab in `TrackerStagesScreen`. `WorktreeContext` runs RalphCore
   alongside WorktreeCore; rows show `⏸ <brief>` when waiting,
   `n:X/Y` when nudged, `!` when capped.

## Key design decisions

- **`status.json` over MCP.** Evaluated early. Chose file-based
  because it's tool-agnostic (works with Claude, Gemini, Codex),
  needs zero bootstrapping per worktree, is inspectable via `cat`,
  and the 4-field schema is small enough that LLMs reliably produce
  correct JSON when given a template in the stage guide. Recorded
  the rationale in `requirements.md` out-of-scope section so a
  future PR proposing MCP can see the tradeoffs.

- **`status.json` canonical for stage; `index.json` retained for
  legacy.** Requirements called for removing the `index.json` stage
  buckets entirely. Shipped a hybrid instead: `getItemStage` reads
  `status.json` first and falls back to buckets; `moveItem` writes
  to both; `listItemsByStage` lets the legacy buckets paper over
  items that don't yet have a `status.json`. This keeps every
  existing screen (kanban, item screen) working without a sweeping
  refactor, and lets agents migrate their own items by simply
  writing `status.json`. Cleanup work to delete the bucket schema
  entirely belongs to a follow-up item.

- **Agent-owned waiting flag.** The flag is never cleared by ralph
  or by tmux-scraping "user typed something". The agent sets it on
  pause and clears it on resume. Simpler protocol, no races. Safety
  net: 24h staleness TTL so a crashed agent doesn't suppress nudges
  forever.

- **Nudge guards.** Ralph *only* fires when `ai_status === 'idle'`
  (never on `working` or `waiting`), the stage hasn't changed, the
  flag isn't fresh-set, the cap isn't hit, ralph is enabled, and a
  main tmux session is attached. Every guard has a unit test.

- **Common tail helper `renderStageProtocol`.** Kept the existing
  `defaultStageFileContent` switch untouched (now
  `defaultStageFileBody`) and wrapped it so every stage inherits the
  same status/gate/input-mode tail. Adding a new setting in the
  future needs one edit, not five.

## Notes for cleanup

- **Lint / comment pass.** RalphCore comments lean explanatory; if
  cleanup is thorough, a second pass to tighten those would help.
- **No E2E test yet.** Task #9 (mock-rendered fake-agent ralph flow)
  is pending. Recommend adding it in cleanup — the unit coverage
  is strong but a UI-level test would verify the projectFeature
  suffix actually renders.
- **`defaultStageFileBody` / `defaultStageFileContent` split.** The
  old code path calling the public method still works; only the
  internal rename is visible via a few existing test edits.
- **Legacy index.json buckets.** Still present and still written
  on `moveItem` for backwards compat. Safe to remove in a follow-up
  once all existing items have `status.json`.
- **Ralph UI chip styling.** The suffix is plain text appended to
  the project/feature cell — terminal-safe, no ANSI, respects the
  existing truncation. If the cell runs tight, the suffix gets
  clipped first (by design).

## How to try it manually

1. Create a project with the tracker and open the stages screen.
2. Navigate to the "Ralph" tab and flip enabled to On.
3. Observe that idle agents get nudged after the configured threshold
   (default 3 minutes).
4. Have an agent write `tracker/items/<slug>/status.json` with
   `is_waiting_for_user: true` and a `brief_description`. Observe
   the suffix in the worktree list and verify ralph does not nudge.

## Tests

- `tests/unit/tracker.test.ts`: 129 tests (26 new covering
  status.json round-trip, staleness, stage derivation, moveItem
  mirroring, protocol rendering for every mode × gate × stage).
- `tests/unit/ralph.test.ts`: 18 tests covering safety invariants,
  detection, counter/cap/reset semantics, nudge text content, and
  log entries.
- Full suite: 664 passing, typecheck clean.
