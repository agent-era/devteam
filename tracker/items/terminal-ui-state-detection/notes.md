# Discovery — terminal-ui-state-detection

## Problem

State detection for the three supported AI CLIs (Claude, Codex, Gemini) is driven by short substring/regex patterns matched against `tmux capture-pane` output. The current tests exercise the logic with ~5–15 line inline string fixtures that don't reflect real terminal output (no box-drawing chrome, trimmed prompts, synthetic phrasing). Patterns like `'allow execution'`, `'yes, allow'`, `'do you want me to'`, `CLAUDE_WAITING_RE`, `'waiting for user'`, and Codex's `'▌' && !'⏎ send'` heuristic are plausible but unverified against current CLI releases, and nothing in the repo tells us when a CLI update breaks detection. We want a repeatable way to snapshot real terminal states per tool and keep the detector honest against those snapshots.

## Findings

**Detection code**
- `src/services/AIToolService.ts:99-150` — `getStatusForTool` (working → waiting → idle fallthrough) and `isWaitingForTool` (per-tool branch).
- `src/constants.ts:77-108` — `AI_TOOLS.{claude,codex,gemini}.statusPatterns.working` plus `idle_prompt` hints (the latter are declared but not consumed by detection).
- `src/services/TmuxService.ts:69-88` — capture path: `tmux capture-pane -p -t <target> -S -50` (plain text, no `-e`, so detection runs against ANSI-stripped content).
- Waiting detection is inconsistent across tools: Gemini uses one substring, Claude uses one regex + four ad-hoc substrings, Codex infers from cursor/send-hint presence. Each tool's "waiting" definition conflates *permission dialog* and *numbered-choice prompt* into one state.

**Current fixtures / tests**
- `tests/unit/ai-tool-detection.test.ts` (≈330 lines) — nine tests (3 tools × 3 states), each with a ~5–15 line inline fixture. Fixtures are hand-written, not captured; no ANSI, no borders, no scrollback noise.
- `tests/unit/AIToolService.test.ts` — unit coverage for `getStatusForTool` and tool detection.
- No `tests/fixtures/` directory for terminal captures.

**Skill convention**
- `.claude/skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`, optional `argument-hint`). Only `submit/` currently exists as an example.

**Known fragile bits**
- Claude detection line 139–145: the inline comment warns about scrollback false positives, but there's no test case for a transcript with a stale `❯ 1. …` still visible after the tool went idle.
- Codex's idle heuristic depends on `⏎ send` being rendered; a resized pane or truncated line could break it silently.
- Process-pattern detection for Codex/Gemini is `['node']`, so any stray `node` process on a pane collides with AI-pane selection (`AIToolService.ts:21-26` / `detectToolFromArgs`).

## Recommendation

A three-part plan for implementation. I want to confirm direction before building.

### 1. Skill: `.claude/skills/capture-ai-states/SKILL.md` (fully automated)

The skill drives every tool × state itself, no human in the loop. For each of `{claude, codex, gemini} × {idle, working, waiting}`:

1. Spawn a scratch tmux session in a sandbox worktree (`tmux new-session -ds ai-capture-<tool>-<state> -c <sandbox>`).
2. Launch the CLI (`tmux send-keys <session> "<tool> <resumeArgs>" Enter`) and poll `tmux capture-pane -p` every ~1s until a startup marker appears (or fail with timeout after ~60s).
3. Drive to the target state by sending a scripted prompt:
   - **idle** — nothing to send; the startup wait above already landed us here. Capture.
   - **working** — send a prompt that keeps the CLI busy for a while (e.g. "Count from 1 to 50, one per line, and briefly describe each number."). Poll until the tool-specific `statusPatterns.working` marker appears, then capture immediately.
   - **waiting** — send a prompt that forces a permission / picker prompt. For Claude: ask it to write/edit a file in the sandbox (permission prompt). For Codex/Gemini: equivalent write-a-file prompt (exact trigger TBD in implementation; may need per-tool tuning). Poll until the tool-specific waiting marker appears, then capture.
4. Write plain-text frame (`tmux capture-pane -p -t <session> -S -200`) to `tests/fixtures/ai-states/<tool>/<state>.txt`. Tear down the tmux session.

Each step has a timeout; failures are reported per cell of the matrix so a flaky tool doesn't block the whole run. The skill is re-runnable and idempotent — fixtures regenerate on each invocation.

### 2. Externalize fixtures + rewrite tests

- New dir `tests/fixtures/ai-states/{claude,codex,gemini}/{idle,working,waiting}.txt`.
- Replace inline fixtures in `tests/unit/ai-tool-detection.test.ts` with a table-driven loader (`readFileSync` + parameterised `describe.each`). Each fixture → expected state.
- Keep `AIToolService.test.ts` unit tests, but add a second block that runs against the same fixture files so both layers agree.

### 3. Fix detection against real captures

Run the new tests, inspect failures, and update patterns in `AIToolService.ts` / `constants.ts` so every real fixture classifies correctly. Expected changes (guesses until fixtures exist):

- Narrow `isWaitingForTool` for Claude to a single multi-line anchored regex that distinguishes *permission dialog* from *numbered-choice prompt* (two sub-states we may want to surface separately later).
- Remove or quote-escape the overly-generic substrings (`'do you want me to'` will false-positive on transcripts).
- For Codex/Gemini, pin detection to the last ~10 lines of the capture (scrollback defence), not the full 50-line window.

Scope: fix only what the real fixtures demonstrate. Do not broaden the state enum (still `working / waiting / idle`) in this item — a sub-state for *permission* vs *picker* is a follow-up if needed.

## Resolved in Discovery

- **Automation level:** fully automated (2026-04-23) — the skill drives each CLI into each state via scripted tmux keystrokes and marker-polling. No human input.
- **Scope:** all three — skill + fixtures + detector fixes — ship together in this item. Detector changes are scoped to what the real fixtures prove broken.
- **Fixture storage:** `tests/fixtures/ai-states/<tool>/<state>.txt` (plain text, the same shape `TmuxService.capturePane` returns).
