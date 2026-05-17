# Discovery — add support for pi.dev agent

## Problem

devteam supports three AI coding agent CLIs (`claude`, `codex`, `gemini`). The
"pi" coding agent from pi.dev is a fourth terminal coding agent users want to run
inside devteam worktrees. It is not currently selectable, launchable, or
status-detected.

## Why

pi is a minimal, token-efficient terminal coding harness (AGENTS.md + skills
support). Users who prefer it currently can't drive it through devteam's
worktree/session/kanban workflow at all — they'd have to launch it manually
outside the tool, losing AI-status detection on the board.

## Findings

### What pi is

- CLI binary: **`pi`**. npm package `@earendil-works/pi-coding-agent`
  (also installable via curl/bun). Repo: `github.com/badlogic/pi-mono`,
  `packages/coding-agent`.
- Interactive launch: bare `pi`.
- Resume: **`-c` / `--continue`** = "continue most recent session"
  (`-r`/`--resume` opens an interactive picker). `--continue` mirrors Claude's
  resume flag exactly and fits devteam's `resumeArgs` + fresh-fallback model.
- TUI: startup header, message log, an editor input box, and a footer line
  (cwd, session name, token/cost/context, model). Editor border colour signals
  thinking level.

### Integration surface in this repo

Adding a tool means touching, at minimum:

- `src/constants.ts` — new `AI_TOOLS.pi` entry (`command`, `resumeArgs`,
  `processPatterns`, `statusPatterns`) and a `CONFIG_SCHEMA.aiToolSettings.pi`
  block so per-project launch flags work.
- `src/services/AIToolService.ts` — `isWorking` and `isWaitingForTool` both
  `switch` on tool and need an explicit `case 'pi'` (the `default` branches
  silently report permanent-idle / never-waiting).
- `tests/fixtures/ai-states/pi/{idle,working,waiting}.txt` + the
  `capture-ai-states` skill (currently claude/codex/gemini only).
- Fakes (`FakeAIToolService` etc.) and the AI-tool test suite.
- Docs: `docs/reference/glossary.md` ("currently `claude` or `gemini`") and
  `docs/concepts/status-model.md`.

`AITool` type, `getAvailableTools`, and the `AIToolDialog` picker are all
data-driven off `AI_TOOLS` keys — no change needed there.

### Notable risk 1 — detection patterns are unknown

pi's docs do **not** specify the on-screen text for idle / working / waiting
states. Detection relies on literal pane-text patterns (`statusPatterns`,
`isWorking`, `isWaitingForTool`). These cannot be written reliably from docs —
they need a real `pi` session captured via the `capture-ai-states` skill. If pi
isn't installed locally, fixtures/patterns will be guesses and status on the
kanban will be wrong.

### Notable risk 2 — `pi` is a 2-char substring

`detectToolFromArgs` runs a strict anchored token regex (`(?:^|[\s/])pi(?=\s|$)`,
safe) **then** a loose `argsLower.includes(tool)` fallback. With `tool === 'pi'`
the loose pass false-matches common process args (`pip`, `compile`, install
paths containing `pi`, etc.), and `TOOL_NAMES` iteration order is explicitly
"first hit wins". The loose fallback must be dropped or guarded for `pi`, or
detection will mis-tag unrelated panes.

## Recommendation

Proceed. The change follows the established codex/gemini pattern and is mostly
mechanical. Two things must be resolved during implementation:

1. **Capture real pi terminal states** (idle/working/waiting) with the
   `capture-ai-states` skill before writing `statusPatterns` — do not guess.
2. **Harden `detectToolFromArgs`** so the loose `.includes` fallback can't
   mis-tag panes as `pi`; prefer strict token matching only for short names.

`resumeArgs` = `--continue`; `processPatterns` likely `['node']` (npm install)
or `['pi']` — confirm against the captured process args.
