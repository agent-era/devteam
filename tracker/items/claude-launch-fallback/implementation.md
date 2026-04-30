# Implementation — claude-launch-fallback

## What was built

Restored the resume-or-fresh shell-level fallback chain that commit `ca72a85` (2026-04-26) had dropped. The fix lives entirely in `src/cores/WorktreeCore.ts`:

- `launchClaudeSessionWithFallback` (`src/cores/WorktreeCore.ts:599`): on the non-fresh path the launch command is now `claude --continue <name+flags+prompt> || claude <name+flags+prompt>`. The `freshWorktree=true` path is unchanged (plain `claude` only — no resume to fall back from).
- `launchAISessionWithFallback`: on the non-fresh path the launch command is now `<resume-form> || <fresh-form>` for codex (`codex resume --last … || codex …`) and gemini (`gemini --resume latest -i … || gemini -i …`). Refactored the body to compute `freshCmd` and `resumeCmd` once instead of re-deriving the same shape twice across the fresh/non-fresh branches.

Both helpers preserve the exact display-name (`-n`), config flag suffix, and initial-prompt argument across the resume and fresh halves of the chain so the user sees identical behavior either way.

## Tests

Updated `tests/unit/WorktreeCoreAutoResume.test.ts`:

- Existing assertions for the non-fresh claude and codex command shapes now expect the `||`-chained command.
- Added `'switching to claude on a worktree previously used with codex still chains the fresh-launch fallback'` — the agent-switch scenario that motivated this item. Sets `lastTool=codex` on the worktree, then attaches with `aiTool='claude'`, and asserts the launch command is the chained form.

`npm test` (781 tests across 77 suites) and `npx tsc -p tsconfig.test.json` both pass.

## Notes for cleanup

- The function names (`launchClaudeSessionWithFallback`, `launchAISessionWithFallback`) once again match their behavior. No rename needed.
- `AIToolService.launchTool` (`src/services/AIToolService.ts:181`) still launches `claude --continue` with no fallback. It is unused in production (`grep` shows no callers in `src/`), so it was left untouched. If a future caller wires it back up, the same fallback shape should be applied there.
- The fallback is intentionally silent — no extra UI/print line — so the user's pane just shows a working AI prompt whether the resume succeeded or not. Matches the original pre-`ca72a85` behavior and the user's preference confirmed during discovery.
