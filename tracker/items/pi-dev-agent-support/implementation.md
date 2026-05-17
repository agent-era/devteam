# Implementation — add support for pi.dev agent

## What was built

Registered the `pi` coding agent (pi.dev, binary `pi`, npm
`@earendil-works/pi-coding-agent`) as a fourth first-class AI tool in devteam.

### Tool registration (`src/constants.ts`)

- New `AI_TOOLS.pi` entry: `name: 'Pi'`, `command: 'pi'`,
  `resumeArgs: '--continue'`, `processPatterns: ['pi']`, `statusPatterns`
  (vestigial `idle_prompt` only — pi's real detection is regex-based, like
  claude). The `AITool` type, `getAvailableTools`, `detectAvailableAITools`,
  and the `AIToolDialog` picker are all data-driven off `AI_TOOLS` keys, so pi
  appears in the picker and is launchable with no further wiring.
- New `CONFIG_SCHEMA.aiToolSettings.pi` block with a `flags` field, so
  per-project launch flags work for pi like the other tools.

### Status detection (`src/services/AIToolService.ts`)

- `PI_WORKING_RE` — matches pi's spinner: a braille glyph at the start of its
  status line (`⠙ Working...`). Excludes U+2800 (blank) so the literal word
  "Working" in transcript text can't false-match.
- `PI_WAITING_RE` — matches pi's select/confirm dialog chrome (`enter select`,
  `↑↓ navigate`, and the standalone `(N/M)` counter line of the filterable
  picker). `isWaitingForTool` also checks the `pi-permission-system` extension's
  phrases (`Permission Required`, `Allow this command/call?`).
- Explicit `case 'pi'` added to both `isWorking` and `isWaitingForTool` — they
  switch on tool and the `default` branch reports permanent-idle / never-waiting.

### Detection hardening (`detectToolFromArgs`)

The loose `argsLower.includes(tool)` fallback was replaced with whole-word
matching (`TOOL_WORD_RES`, `\bname\b`). A 2-char name like `pi` would otherwise
mis-tag `pip`, `compile`, or any path/word merely containing `pi`. The strict
token pass is unchanged; the fallback is now bounded.

### Key decisions

- **pi has no built-in permission gate** — by default it auto-runs bash/edits
  and never blocks on the user. Its only agent-blocked "waiting" state comes
  from the third-party `pi-permission-system` extension, which renders as a
  standard pi `select` dialog. Per the user's call, detection covers both pi's
  native interactive dialogs (model selector, command palette, confirm) **and**
  that extension's permission prompt.
- **`resumeArgs: '--continue'`** — verified `pi --continue` starts fresh and
  exits 0 when there's no prior session, so the `pi --continue || pi` chain in
  `launchAISessionWithFallback` works (the `|| pi` simply never needs to fire).
- pi launches as the bare `pi` binary in `ps -o args=` (not `node …`), so
  `processPatterns` is `['pi']`.

### Fixtures, tests, capture tooling

- `tests/fixtures/ai-states/pi/{idle,working,waiting}.txt` — real captures from
  pi v0.74.1 (idle/working from a bare `pi`; waiting via the
  `pi-permission-system` extension). `README.md` explains regeneration.
- `tests/unit/ai-tool-detection.test.ts` — `pi` added to the fixture-driven
  matrix.
- `tests/unit/AIToolService.test.ts` — new "Pi status detection" block; the
  detect-from-args cases updated for whole-word matching (an embedded substring
  no longer resolves) plus pi-specific cases (`pip`, `compile` → `none`).
- `tests/fakes/FakeAIToolService.ts` — `isAIPaneCommand` recognises `pi`.
- The `capture-ai-states` skill (`.claude/skills/capture-ai-states/`) gained a
  `pi` entry in `capture.mjs` and SKILL.md. **Note:** this skill is local-only
  tooling — `.claude/` is gitignored, so that change is not in the commit; it
  lives on disk where the skill runs.

### Docs

- `docs/reference/glossary.md` and `docs/concepts/status-model.md` now list
  `pi` alongside the other AI tools.

## Verification

- `npm run typecheck` — passes.
- `npm test` — 815/815 pass.
- `npm run build` — passes.
- End-to-end: launched pi via the real `createSessionWithCommand` path
  (`bash -c pi --continue || pi`); `detectAllSessionAITools` tagged the session
  `pi` and `getStatusForTool` returned `idle`.

## Notes for cleanup

- The `capture-ai-states` skill edits are not version-controlled (gitignored
  `.claude/`); nothing to review there in the diff.
- `pi`'s waiting fixture depends on the `pi-permission-system` extension being
  installed to regenerate — documented in the fixtures README.

## Stage review

Added pi as a fully data-driven fourth AI tool — the only non-mechanical work
was capturing real pi terminal output for detection patterns and replacing the
unsafe substring fallback in `detectToolFromArgs` with whole-word matching.
Discovered pi has no built-in permission gate, so the "waiting" state is
detected from pi's select dialogs plus the optional `pi-permission-system`
extension. typecheck/test (815)/build all green; verified end-to-end.
