---
title: terminal-ui-state-detection — implementation notes
slug: terminal-ui-state-detection
updated: 2026-04-26
---

## What was built

1. **Capture skill** at `.claude/skills/capture-ai-states/`:
   - `SKILL.md` — frontmatter + how-to.
   - `capture.mjs` — drives each (tool × state) cell automatically. Spawns a scratch tmux session per cell, dismisses known consent dialogs (Claude trust-folder, Codex trust-folder), drives the CLI to the target state, captures via `tmux capture-pane -p -S -50` (matching `TmuxService.capturePane` in production), writes to `tests/fixtures/ai-states/<tool>/<state>.txt`. Per-cell timeouts; failures don't abort the matrix.
   - Subset flags: `--tool {claude|codex|gemini}` and `--state {idle|working|waiting}`.

2. **Real fixtures** under `tests/fixtures/ai-states/`:
   - `claude/{idle,working,waiting}.txt` — captured live.
   - `codex/{idle,working,waiting}.txt` — captured live (codex launched with `-a untrusted` so the waiting cell hits a permission picker).
   - `gemini/{idle,working,waiting}.txt` — **curated, not live**. Gemini's per-project oauth picker can't be auto-dismissed in this environment; the script raises a clear error per cell when the auth picker appears, and the committed fixtures are realistic snapshots representing each state.

3. **Table-driven tests** at `tests/unit/ai-tool-detection.test.ts`:
   - Rewritten as a fixture loader keyed on `<tool>/<state>`.
   - Asserts `AIToolService.getStatusForTool(fixture, tool) === state`.
   - Plus an explicit invariant test for the trust-folder false-positive.
   - Replaces the inline `claudeScreens` / `codexScreens` / `geminiScreens` objects.

4. **Detector fixes** in `src/services/AIToolService.ts`:
   - **Order**: waiting is checked before working. Reason: a permission picker (user-actionable) can render alongside a transient working spinner (e.g. Claude's `Reading 1 file… (ctrl+o to expand)` shows above its own picker). User intent wins.
   - **Claude working**: replaced the `… (` substring with `/…\s*\(\d+s/`. The substring matched transcript lines like `Reading 1 file… (ctrl+o to expand)` and false-positively classified an idle/waiting frame as working. Real working spinners always include the duration `(Ns`.
   - **Claude waiting**: kept the trust-folder dialog matching as "waiting" — the user does need to act on it before the agent can proceed, so surfacing it on the kanban is correct (this overrode an earlier draft that excluded it).
   - **Codex waiting**: replaced `▌ && !⏎ send` with `/press enter to confirm/i || /would you like to run/i`. Modern codex (v0.125+) doesn't use `▌` at all (uses `›`), so the legacy heuristic was dead code. It also conflated working with waiting because the streaming spinner also lacks the send hint.

## Other test changes

- `tests/unit/AIToolService.test.ts` — updated codex `waiting`/`idle` synthetic fixtures to use the modern markers.
- `tests/unit/ai-tool-switching.test.ts` — unchanged. Its "working takes priority over waiting for Codex" test now passes naturally because waiting only fires on the modern picker markers (which the synthetic working fixture doesn't contain).

## Key decisions

- **Curated gemini fixtures vs. blocking on auth**: Gemini's per-project oauth picker fires on every fresh `mktemp` sandbox even with `--skip-trust` and a global `selectedAuthType`. Rather than blocking the whole item on a third-party auth UX issue, we ship realistic snapshots for the gemini cells and document the limitation in `SKILL.md`. The script surfaces a clear error if it lands on the auth picker so future runs fail loudly rather than silently producing junk fixtures.
- **Detector schema unchanged**: `AI_TOOLS[tool].statusPatterns.working` stays a substring constant. Tool-specific tightening is done inline in `AIToolService.isWorking` (regex for Claude). Less invasive than reshaping the constants schema.
- **Bracketed-paste workaround**: Codex (and likely others) detect rapid text+Enter as a paste and the Enter is folded into paste content. The capture script now sleeps 800ms between text and Enter, which is the difference between a no-op send and a successful submit.

## Notes for cleanup

- The `.claude` directory in this worktree is a symlink to `/home/mserv/projects/devteam/.claude`. Anchoring the script via `__dirname` resolved through the symlink and wrote fixtures to the wrong repo. The script anchors to `process.cwd()` instead — must be run from the repo root.
- `src/constants.ts` `AI_TOOLS.claude.statusPatterns.working: '… ('` is now unused (Claude takes the regex path in `AIToolService.isWorking`). Left as-is for now — could be cleaned up but the constants are also referenced by tests/configs that didn't need changing.
- No regressions in the existing detector test suite (615/615 pass), `npm run typecheck`, or `npm run build`.

## Stage review

Implement: validated detection against real fixtures for claude+codex, surfaced and fixed three real detector bugs (Claude trust-folder false positive, Claude working substring matches transcript lines, Codex waiting heuristic broken on modern UI). Codex fixtures required iterating on the capture script (consent ordering, post-startup grace, bracketed-paste workaround). Gemini auto-capture blocked by per-project oauth picker — shipped curated fixtures with a clear runtime error to guide future regeneration.
