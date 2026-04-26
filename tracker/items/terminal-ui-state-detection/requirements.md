---
title: "make a skill to run and observe the different states of the terminal UIs (codex, gemini, claude) and get them into each state (idle, running, waiting for permission/questions). update tests with those \"screenshots\" and fix all the state detection logic"
slug: terminal-ui-state-detection
updated: 2026-04-23
---

## Problem

State detection for the three supported AI CLIs (Claude, Codex, Gemini) is driven by short substring/regex patterns matched against `tmux capture-pane` output. The current tests exercise the logic with ~5–15 line inline string fixtures that don't reflect real terminal output (no box-drawing chrome, trimmed prompts, synthetic phrasing). Patterns like `'allow execution'`, `'yes, allow'`, `'do you want me to'`, `CLAUDE_WAITING_RE`, `'waiting for user'`, and Codex's `'▌' && !'⏎ send'` heuristic are plausible but unverified against current CLI releases, and nothing in the repo tells us when a CLI update breaks detection. We want a repeatable way to snapshot real terminal states per tool and keep the detector honest against those snapshots.

## Why

Real captures are the only source of truth for what the detector sees in production. Without them, test fixtures drift from reality, bugs surface only as user-reported mislabelled cards on the kanban, and each CLI upgrade silently risks a regression in AI-status signalling — which is the primary at-a-glance signal devteam shows.

## Summary

Ship three pieces together, in one item: (1) an automated capture skill at `.claude/skills/capture-ai-states/` that spawns a scratch tmux session per tool, scripts the CLI into each of idle / working / waiting, and writes the pane dump to a fixture file; (2) an externalised fixture tree under `tests/fixtures/ai-states/<tool>/<state>.txt` with table-driven tests that replace the inline strings in `tests/unit/ai-tool-detection.test.ts`; (3) targeted patches to `src/services/AIToolService.ts` and `src/constants.ts` for whatever the real fixtures prove broken — no speculative detector changes.

## Acceptance criteria

1. A skill exists at `.claude/skills/capture-ai-states/SKILL.md` with YAML frontmatter following the `.claude/skills/submit/` convention (`name`, `description`, optional `argument-hint`).
2. Running the skill produces, for each of `{claude, codex, gemini} × {idle, working, waiting}`, a plain-text fixture file at `tests/fixtures/ai-states/<tool>/<state>.txt` containing the output of `tmux capture-pane -p -t <session> -S -200` at the moment the target state was detected.
3. The skill drives each CLI into each state without human intervention: launch in a scratch tmux session, send a scripted prompt via `tmux send-keys`, poll the pane every ~1s for the tool's state marker, capture on match, tear down the session. Each cell has an independent timeout (≥60s) and failures are reported per cell without aborting the rest of the matrix.
4. `tests/unit/ai-tool-detection.test.ts` is rewritten as table-driven (`describe.each` / loader reading the fixture files); the inline `claudeScreens` / `codexScreens` / `geminiScreens` objects are removed. Every fixture from criterion 2 is asserted to classify to the expected state via `AIToolService.getStatusForTool`.
5. `npm test` passes. Any detector change required to make real-capture fixtures classify correctly is applied in `src/services/AIToolService.ts` and/or `src/constants.ts`, scoped to observed mismatches; the state enum (`working` / `waiting` / `idle`) is unchanged.
6. `npm run typecheck` and `npm run build` succeed.
7. The skill is re-runnable and idempotent: invoking it a second time overwrites existing fixtures cleanly and leaves no orphan tmux sessions behind.

## Out of scope

- Introducing new states (e.g. separate `permission` vs `picker` sub-states of `waiting`).
- Refactoring the tmux pane-selection logic (`TmuxService.findAIPaneTarget`) or the `processPatterns: ['node']` collision for Codex/Gemini — note only; fix is a follow-up.
- CI integration of the capture skill. Fixtures are generated locally and committed; tests only read them.
