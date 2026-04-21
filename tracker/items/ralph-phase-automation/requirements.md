---
title: Ralph-like phase automation
slug: ralph-phase-automation
updated: 2026-04-20
---

## Problem

When an agent is working a tracker item autonomously, it sometimes halts
mid-stage: the stage guide is read, some work is done, then the agent sits idle
at a prompt without advancing the item's stage in `tracker/index.json`. Today
nothing detects this "stuck between stages" state and nothing nudges the agent
to either finish and advance, or explain the blocker. The human has to notice
and manually type "continue" in every tmux pane. Pain scales with the number
of parallel worktrees.

Beyond just stalls: today there is no principled way for the user to say
"run autonomously through most stages, but pause for my review before
implementation" or "don't auto-submit the PR, let me approve it first." The
agent either plows through or stops unpredictably — there is no knob.

Also: the only reliable signal that an agent is waiting for input today is the
`ask_questions` tool, which surfaces a numbered prompt detectable as
`ai_status === 'waiting'`. But many users prefer to be asked inline, via doc
review, or as a single batched message — in which case the tmux pane looks
`idle` even though the agent is legitimately waiting. Ralph has no way to
tell the difference from the pane alone.

We solve this by giving the agent a tiny metadata file to write — no new
infrastructure, no per-worktree MCP bootstrapping, tool-agnostic (works with
Claude, Gemini, Codex), inspectable via `cat`, and trivially unit-testable.
The failure modes are the same as any tool-based approach (agent forgets to
update), and they're handled by stage-guide instructions + a staleness TTL.

## Why

- `ai_status` detection already exists (`AIToolService.getStatusForTool()` →
  `working | waiting | idle`) and is refreshed every 2s by `WorktreeCore`.
- Stage is already authoritative in `tracker/index.json` via `TrackerService`.
- `TmuxService.sendText()` can deliver a prompt to the main session.
- Per-stage settings already exist (`StageConfig.settings`, surfaced as cycle
  dropdowns in `TrackerStagesScreen.tsx`, persisted in
  `tracker/work-style.json` via `saveStageSettings`). Stage guide files are
  regenerated from these settings via `defaultStageFileContent()`.
- `waiting` (numbered prompt) only covers the `ask_questions`-tool case. For
  any other input mode we need a second signal — an explicit metadata flag
  the agent writes to the item directory.
- Stage-aware nudges are more effective than a generic "continue" because they
  remind the agent of the exit criteria for the current stage.
- Nothing ties these pieces together yet, so the user has no autonomy policy,
  no stall rescue, and no reliable way to tell the harness "I'm waiting for
  you."

## User stories

- As a developer running multiple worktrees, I want idle agents that haven't
  advanced a stage to be nudged automatically, so I don't have to babysit each
  tmux pane.
- As a developer, I want nudges to be stage-aware (reminding the agent what
  the current stage expects) so the agent makes real progress instead of just
  acknowledging and stalling again.
- As a developer, I want to configure per stage whether the agent advances
  autonomously or pauses for my review before moving to the next stage, so I
  can be hands-off on low-stakes items but approve transitions on important
  ones.
- As a developer, I want a specific "submit" gate on the cleanup stage that
  decides whether the agent creates the PR automatically or waits for my
  approval first.
- As a developer, I want to pick how I'm asked for input per stage
  (ask_questions tool, inline, batched, doc review), because that affects how
  I triage parallel worktrees — `ask_questions` is terminal-native, inline is
  conversational, doc review is asynchronous.
- As a developer, I want any agent that pauses for non-`ask_questions` input
  to flag itself in the item's metadata with a short reason, so ralph can tell
  "idle because waiting for me" from "idle because stuck", and so the UI can
  show me what each paused agent needs.
- As a developer, I want ralph to never interrupt an agent that's genuinely
  working or legitimately waiting (via either `ask_questions` or the metadata
  flag).
- As a developer, I want to see in the worktree list: the current stage,
  whether an agent is waiting on me (with the short reason), nudge count, and
  whether it's capped — so one glance tells me which worktrees need
  intervention.
- As a developer, I want to turn ralph on/off and configure gates + input
  mode from the existing `TrackerStagesScreen`, so I don't need new config
  surface area.

## Summary

Four pieces that reinforce each other:

1. **Autonomy policy (per-stage gates)** — new per-stage settings on
   `StageConfig.settings`:
   - `gate_on_advance`: `none | review_and_advance | wait_for_approval`.
   - On `cleanup` only, `submit`: `auto | approve` (for the PR step).
   The generated stage guide text incorporates the gate so the agent reads it
   as part of its normal prompt.

2. **Input mode (per-stage)** — new per-stage setting `input_mode` with
   choices `ask_questions | inline | batch | doc_review`. The stage guide
   tells the agent which mode to use when it needs input during the stage.

3. **Agent status metadata file (canonical stage source)** — the agent
   writes `tracker/items/<slug>/status.json` with
   `{ stage, is_waiting_for_user, brief_description, timestamp }`.
   `status.json` becomes the **canonical source of truth for an item's
   current stage**. The agent updates it on every meaningful transition
   (stage start/advance, pause, resume) in every input mode.
   `tracker/index.json`'s stage buckets are refactored to be derived
   from a scan of per-item `status.json` files. Ralph treats
   `is_waiting_for_user: true` with a fresh timestamp the same as
   `ai_status === 'waiting'` for nudge suppression.

4. **Nudge loop** — a `RalphCore` samples `(ai_status, stage,
   status_file)` per active worktree and fires a stage-aware continue
   nudge (via `TmuxService.sendText` to the main session) when the agent
   has been `idle` continuously, the stage is unchanged for ≥
   `idleThresholdMs`, and no waiting status in status.json is present. Capped at
   `maxNudgesPerStage`; counter resets on stage change.

Config + UI: a new "Ralph" tab in `TrackerStagesScreen` exposes ralph-level
settings. Gate + input mode settings live on each stage's existing tab as
new dropdowns. `WorktreeListScreen` surfaces waiting state (with reason),
nudge count, and cap.

## Acceptance criteria

### Agent status metadata file (foundational)

1. Every item always has a `tracker/items/<slug>/status.json` file
   maintained by the agent. Schema:
   ```json
   {
     "stage": "discovery" | "requirements" | "implement" | "cleanup",
     "is_waiting_for_user": boolean,
     "brief_description": "string, ≤ 120 chars — describes current
                           activity when is_waiting_for_user is false,
                           and what is being waited on when true",
     "timestamp": "ISO-8601"
   }
   ```
2. The stage guide instructs the agent to update this file on every
   meaningful transition, in all input modes (no exceptions). Updates
   happen at: stage start, before pausing for input (set
   `is_waiting_for_user: true` with a `brief_description` of what is
   being waited on), when resuming work (flip back to false and update
   `brief_description` to reflect current activity), and on stage
   advance (update `stage`). The file is never deleted during an item's
   lifetime — only overwritten.
3. `status.json` is the canonical source of truth for an item's
   stage. `index.json` is refactored so its per-stage buckets
   (`backlog`, `discovery`, `requirements`, `implement`, `cleanup`)
   are derived from scanning `tracker/items/*/status.json` on read,
   not stored as authoritative data. `index.json` retains only:
   project-level data that isn't per-item stage (the `archive` list,
   the `sessions` map, any future project metadata). See the
   "index.json refactor" AC section below.
4. `TrackerService` gains helpers:
   `getItemStatus(projectPath, slug): ItemStatus | null` and
   `writeItemStatus(projectPath, slug, status): void`. Both unit-tested.
5. Safety net: ralph ignores `is_waiting_for_user: true` when the
   `timestamp` is older than 24 hours (handles crashed agents that
   never cleared). Staleness is logged.

### index.json refactor (stage buckets become derived)

5a. `tracker/index.json` no longer stores per-stage slug buckets.
    The fields `backlog.backlog`, `backlog.discovery`,
    `backlog.requirements`, `implementation.implement`,
    `implementation.cleanup` are removed from the canonical schema.
    Retained fields: `archive` (list of archived slugs),
    `sessions` (map of slug → metadata), and any future
    project-level keys.
5b. A new `TrackerService.listItemsByStage(projectPath):
    Record<TrackerStage, string[]>` walks `tracker/items/*/` and
    reads each `status.json`. Items without a status.json are
    bucketed to `backlog` by convention. Archived items come from
    `index.json.archive` (unchanged).
5c. Existing call sites are updated:
    - `getItemStage(slug)` reads `status.json` first; if absent,
      falls back to a default (`backlog`).
    - `moveItem(slug, toStage)` writes the new stage into
      `status.json` (creating it if absent) and does **not** mutate
      `index.json` buckets.
    - `nextStage` / `previousStage` order is unchanged.
    - The kanban view (`TrackerBoardScreen`) and any other screens
      that enumerate items per stage call
      `listItemsByStage()`.
5d. Migration: on first run after the refactor, if a project's
    `index.json` still contains legacy stage buckets, the service
    materialises a `status.json` for each slug found there and
    then writes `index.json` back without the buckets. Migration
    is idempotent and logged. Unit tests cover a migration run on
    a fixture `index.json` with the old shape.
5e. Agent stage-advancement instructions in the generated stage
    guide change to "update `status.json`" rather than "edit
    `tracker/index.json`". `TrackerService.buildPlanningPrompt()`
    and related helpers are updated accordingly.

### Input-mode setting (per-stage)

6. Each stage (`discovery | requirements | implement | cleanup`) gains
   an `input_mode` dropdown in `STAGE_OPTION_DEFS`, choices:
   - `ask_questions` — use the ask_questions tool (terminal-native
     numbered prompt).
   - `inline` — ask questions inline in chat.
   - `batch` — ask all questions at once in a single message.
   - `doc_review` — write the stage's output file then ask the user
     to review it.
7. In every mode, the agent must update `status.json` before pausing
   and after resuming (per §2). The modes only differ in the *form* of
   the user interaction, not in whether `status.json` is maintained.
8. Default per stage: all four default to `ask_questions`.
9. `defaultStageFileContent(stage, settings)` incorporates the chosen
   input mode into the generated stage guide along with the
   status.json update instructions. Unit tests cover four modes × four
   stages.

### Gate settings (per-stage autonomy policy)

10. Each stage gains a `gate_on_advance` dropdown in
    `STAGE_OPTION_DEFS`:
    - `none` — agent advances silently.
    - `review_and_advance` — agent appends a 1–3 sentence "Stage
      review" section to the stage's output file (e.g., `notes.md`
      for discovery, `requirements.md` for requirements,
      `implementation.md` for implement), then advances.
    - `wait_for_approval` — agent must ask for approval via the
      stage's `input_mode` (and set `is_waiting_for_user: true` in
      status.json) before advancing.
11. Defaults: `discovery` = `none`; `requirements` =
    `wait_for_approval`; `implement` = `review_and_advance`;
    `cleanup` = `wait_for_approval` (the PR-submit gate is the
    `submit` setting below).
12. `cleanup` additionally gains a `submit: auto | approve` dropdown
    (default `approve`) governing PR creation. When `approve`, the
    stage guide instructs the agent to pause (per input_mode) before
    opening the PR.
13. `defaultStageFileContent()` renders the gate instruction into the
    generated stage markdown. Changing a gate setting rewrites the
    stage guide on disk immediately (same pattern as
    `cycleStageOption` in `TrackerStagesScreen.tsx`).

### Nudge detection

14. A new `RalphCore` (under `src/cores/`) runs a sampling loop per
    active worktree session. Minimum 60s between samples.
15. Per-worktree state: `idle_since`, `stage_last_seen`,
    `stage_unchanged_since`, `nudges_this_stage` (reset when stage
    advances or when `is_waiting_for_user` flips true).
16. A nudge fires iff all of:
    - `ai_status === 'idle'` continuously for ≥ `idleThresholdMs`
      (default **3 minutes**).
    - `status.json.stage` unchanged for ≥ the same threshold.
    - `status.json` does not report `is_waiting_for_user: true` with
      a fresh (< 24h) timestamp.
    - `nudges_this_stage < maxNudgesPerStage` (default 3).
    - Ralph is enabled in the project config.
    - The worktree has an active tmux main session.
17. Observing a stage change, or a fresh flip of
    `is_waiting_for_user` to true, resets `idle_since` and
    `nudges_this_stage` to zero.

### Nudge delivery

18. Nudges use `TmuxService.sendText()` into the main session
    (`dev-{project}-{feature}`). Shell and run sessions are never
    targeted.
19. Nudge text is a stage-specific template. Each template includes:
    stage name, stage-guide path, expected output file, current
    gate setting, current `input_mode`, and an explicit "if blocked,
    set `is_waiting_for_user: true` in status.json" clause.
20. Each nudge is appended to `./logs/ralph.log` as
    `{timestamp, project, slug, stage, nudgeNumber, idleMs}`.

### Backoff & visibility

21. After `maxNudgesPerStage` nudges on the same stage without
    advancement, no further nudges fire until the stage changes or
    `is_waiting_for_user` flips true.
22. `WorktreeListScreen` surfaces, per row:
    - current stage
    - waiting state: `ai_status === 'waiting'` or
      `status.json.is_waiting_for_user === true` with fresh
      timestamp. When waiting, show the ≤ 120-char
      `brief_description` (truncated to fit row width).
    - nudge count `n:X/Y` when X > 0 and not capped.
    - a distinct "needs attention" indicator when capped.
23. The cap resets automatically on stage change or on fresh waiting
    flip.

### Safety invariants (each has a unit test)

24. Ralph never sends a nudge when `ai_status === 'waiting'`.
25. Ralph never sends a nudge when `ai_status === 'working'`.
26. Ralph never sends a nudge when `status.json.is_waiting_for_user`
    is true with a fresh (< 24h) timestamp.
27. Ralph never sends a nudge when ralph is disabled for the project.
28. Ralph never sends a nudge to a session absent from tmux.

### Config & UI

29. Ralph-level config lives per project at `tracker/ralph.json`:
    `{ enabled, idleThresholdMs, maxNudgesPerStage }`. Defaults
    applied when file is missing.
30. A new **"Ralph"** tab is added to `ALL_TABS` in
    `TrackerStagesScreen` exposing the three ralph-level fields with
    the same cycle-value UI.
31. Each stage tab gains `gate_on_advance` and `input_mode` dropdowns.
    The cleanup tab additionally gains `submit`.
32. `WorktreeListScreen` renders the `brief_description` next to the
    row while waiting (truncated) and nudge state per §22.

### Tests

33. Unit tests cover each safety invariant §24–28.
34. Unit tests cover: nudge fires on sustained idle + unchanged
    stage; counter increments; counter resets on stage change and on
    fresh waiting flip; cap respected.
35. Unit tests cover `getItemStatus` / `writeItemStatus` round-trips
    and the 24h stale rule.
36. Unit tests cover `defaultStageFileContent` rendering for:
    - every `input_mode` × stage combination
    - every `gate_on_advance` × stage combination
    - `submit` on cleanup (both values)
37. A fake `TmuxService` asserts nudge text contains current stage
    name, expected output file path, current `input_mode`, and
    current `gate_on_advance`.
38. E2E (mock-rendered) test with a fake agent that writes
    `is_waiting_for_user: true`: ralph does not nudge while fresh;
    clearing the flag and advancing fake time produces a nudge;
    hitting the cap surfaces "needs attention" on the UI row.
39. E2E test that the `brief_description` appears (truncated) on the
    `WorktreeListScreen` row while waiting.

### Out of scope

- Nudging when `ai_status === 'working'`.
- md-file marker parsing as a primary phase source — `index.json`
  remains authoritative.
- Global (cross-project) ralph config.
- Cross-process persistence of nudge counters (in-memory resets on
  app restart; acceptable).
- Gates / input_mode on `backlog` (no output file; advancement logic
  is distinct).
- Automatic detection of "user sent a message" to clear
  `is_waiting_for_user`. The flag is agent-owned: the agent sets it
  on pause and clears it on resume. Ralph only reads. Keeps the
  protocol simple; avoids racing on tmux pane scraping.
- A devteam-tracker MCP server. Rejected in favour of the status.json
  file: tool-agnostic (works with Claude, Gemini, Codex), zero
  bootstrapping, inspectable via `cat`, and the schema is small
  enough that LLMs reliably produce correct JSON when given a
  template in the stage guide. Revisit if MCP-native integrations
  (live UI updates, richer typed tools) become a concrete need.
