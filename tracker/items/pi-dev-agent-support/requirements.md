# Requirements — add support for pi.dev agent

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

## Summary

Register the `pi` coding agent (binary `pi`, npm `@earendil-works/pi-coding-agent`)
as a first-class AI tool in devteam, following the existing codex/gemini pattern:
add it to `AI_TOOLS` and the project config schema, give it status-detection rules
for idle/working/waiting, and cover it with fixtures and tests. As part of this,
harden `AIToolService.detectToolFromArgs` so the short two-character name `pi`
cannot false-match unrelated process arguments — replace the loose substring
fallback with whole-word/token matching.

## Acceptance criteria

### Tool registration & launch

1. `AI_TOOLS` in `src/constants.ts` gains a `pi` entry with `name` (`"Pi"`),
   `command` (`"pi"`), `resumeArgs` (`"--continue"`), `processPatterns`, and
   `statusPatterns`. The `AITool` type, `getAvailableTools`, and the
   `AIToolDialog` picker pick `pi` up automatically with no further change.
2. `pi` is launchable from the AI-tool picker and via the `[T]` "different tool"
   flow; launching resumes the most recent session (`pi --continue`) and falls
   back to a fresh `pi` session when there is nothing to resume, matching the
   existing `launchAISessionWithFallback` behaviour.
3. `CONFIG_SCHEMA.aiToolSettings` in `src/constants.ts` gains a `pi` block with a
   `flags` `string[]` field, so per-project launch flags work for `pi` the same
   way they do for `claude`/`codex`/`gemini`.

### Status detection

4. `AIToolService.isWorking` has an explicit `case 'pi'` that detects pi's
   working/busy state from real pane text — it must not fall through to the
   `default` branch (which reports permanent idle).
5. `AIToolService.isWaitingForTool` has an explicit `case 'pi'` that detects
   pi's user-actionable prompts (permission/consent/picker), consistent with the
   project rule that any prompt needing a user keystroke counts as "waiting".
6. The idle/working/waiting `statusPatterns` and detection rules for `pi` are
   derived from a real captured `pi` session, not guessed from documentation.
   `processPatterns` is set to whatever the captured process args actually show.

### Detection hardening (short-name safety)

7. `AIToolService.detectToolFromArgs` no longer mis-tags panes as `pi`: the loose
   `argsLower.includes(tool)` fallback is replaced with whole-word/token matching
   so common args (`pip`, `compile`, paths or words merely containing `pi`) do
   not match the `pi` tool. Detection of `claude`/`codex`/`gemini` is unchanged.
8. A unit test asserts that process args containing `pi` as a substring but not
   as a whole word (e.g. `pip install`, a path with `compile`) resolve to `none`
   (or the correct tool), while a genuine `pi`/`pi --continue` invocation
   resolves to `pi`.

### Fixtures, tests & capture tooling

9. `tests/fixtures/ai-states/pi/{idle,working,waiting}.txt` exist and reflect
   real `pi` terminal output. If `pi` cannot be captured live, the fixtures are
   curated realistic snapshots with a `README.md` explaining this, matching the
   existing `gemini` fixtures convention.
10. `tests/unit/ai-tool-detection.test.ts` covers `pi` for idle, working, and
    waiting states, and `FakeAIToolService` (and any other fakes enumerating
    tools) handle `pi` without error.
11. The `capture-ai-states` skill is extended to include `pi` in its tool matrix
    (skill description, `argument-hint`, and `capture.mjs`), so detector fixtures
    for `pi` can be regenerated like the other tools.

### Documentation

12. `docs/reference/glossary.md` and `docs/concepts/status-model.md` are updated
    to list `pi` alongside the other supported AI tools.

### Verification

13. `npm run typecheck`, `npm test`, and `npm run build` all pass with the new
    tool wired in.
