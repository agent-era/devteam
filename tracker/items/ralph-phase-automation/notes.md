---
title: Ralph-like phase automation
slug: ralph-phase-automation
updated: 2026-04-20
---

## User problem

When an agent is working a tracker item autonomously, it sometimes halts mid-stage:
the stage guide is read, some work is done, then the agent sits idle at a prompt
without advancing the item's stage in `tracker/index.json`. Today, nothing detects
this "stuck between stages" state and nothing nudges the agent to either finish
and advance, or explain the blocker. The human has to notice and manually type
"continue" in every tmux pane.

The user wants: when an agent is **idle** (not working, not awaiting answer to a
real question), **hasn't advanced the stage**, and no human input is arriving,
the system should detect the stall and send a targeted nudge that reminds the
agent which stage it's in and what the exit criteria are.

Affects: anyone running multiple worktrees with devteam + the tracker workflow.
Pain is proportional to worktree count — the more parallel agents, the more
babysitting.

## Recommendation

Build this in three layers, re-using existing infra rather than inventing new systems:

### 1. Phase source of truth: `tracker/index.json` (already exists)

Each worktree slug is already bucketed into a stage in `tracker/index.json`
(`backlog | discovery | requirements | implement | cleanup | archive`). That is
the authoritative phase. Do **not** re-invent with md-file markers as the primary
source — `index.json` is already updated by the agent when advancing, and
`TrackerService` already has `getItemStage(slug)`, `nextStage()`, `moveItem()`.

**Secondary markers** (optional, cheap): when we nudge, also peek at the expected
output file for the current stage (e.g., `notes.md` for discovery,
`requirements.md` for requirements) to tell the agent *"you already wrote
notes.md — advance the index"* vs *"you haven't written notes.md yet — do that
first"*. This gives the nudge more signal without a new marker format.

### 2. Stall detection loop (new, per-worktree)

Add a `RalphCore` (or extend `WorktreeCore`) that runs per worktree with a
session:

- Every ~30s, sample `(ai_status, stage, last_stage_change_at)`.
  - `ai_status` comes from existing `AIToolService.getStatusForTool()` — states
    are `working | waiting | idle`.
  - `stage` comes from `TrackerService.getItemStage(slug)`.
- Track: `idle_since` (first time we saw `idle` in a row) and
  `stage_unchanged_since`.
- Trigger condition: `ai_status === 'idle'` for ≥ `idleThresholdMs` **AND**
  `stage` unchanged for ≥ same window **AND** not currently `waiting`
  (i.e., not blocked on a real prompt the user should answer).

Defaults: 3 minutes idle, max 3 nudges per stage before backing off.

Key nuance: `waiting` (numbered prompt) must **never** be nudged — that means
the agent is asking a human a real question. Only `idle` is safe.

### 3. Nudge action (re-uses `TmuxService.sendText`)

When the trigger fires, send a stage-aware message into the main session:

```
[ralph] You appear idle in stage "<discovery>". The item's index.json still
shows this slug under "<discovery>". If notes.md is written and you're
satisfied, advance the index to the next stage and read the next stage guide.
If you're blocked, use ask_questions. Otherwise continue the current stage.
```

Stage-specific templates (map of 5 strings) keep the nudge pointed. The nudge
text references the actual stage guide path so the agent can re-read it.

### 4. Config + UX

- Opt-in per project in `.devteam/config.json` under a new
  `ralphAutomation: { enabled, idleThresholdMs, maxNudgesPerStage }` section.
- Per-worktree opt-out via session env tag (same mechanism as
  `@devteam_project`).
- Surface nudge count + last-nudge time on the WorktreeListScreen row so the
  user can see which agents are being auto-driven.
- Log every nudge to `./logs/ralph.log` for auditing.

### Why this shape

- **No new protocol** — re-uses `ai_status`, `index.json`, `TmuxService.sendText`.
- **Safe by default** — only nudges on `idle`, never on `waiting`.
- **Observable** — nudges are logged and surfaced in the UI; easy to turn off.
- **Stage-aware nudges** beat generic "continue" — they remind the agent of the
  exit criteria so it makes real progress instead of just saying "ok" and
  stalling again.

### Open questions for requirements stage

- Should nudges require a brief human confirmation the first N times, then go
  fully automatic? Or silent from the start?
- Should we also nudge on `working` if stage hasn't changed in ≥ 30 min?
  (handles "agent is spinning in a long loop without advancing")
- Backoff policy when 3 nudges fail: stop forever, stop until human input, or
  page the human?
