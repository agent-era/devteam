# Implementation — claude-launch-fallback

## What was built

Restored the resume-or-fresh shell-level fallback chain that commit `ca72a85` (2026-04-26) had dropped. The fix lives entirely in `src/cores/WorktreeCore.ts`.

- Merged `launchClaudeSessionWithFallback` into the unified `launchAISessionWithFallback` helper. The previous split existed only because Claude takes a `-n displayName` flag — that's now an optional trailing parameter on the unified helper, threaded from the call site only when the selected tool is claude.
- On the non-fresh path the launch command is now `<resume-form> || <fresh-form>` for all three tools:
  - claude: `claude --continue -n … <flags> [prompt] || claude -n … <flags> [prompt]`
  - codex: `codex resume --last <flags> [prompt] || codex <flags> [prompt]`
  - gemini: `gemini --resume latest <flags> -i [prompt] || gemini <flags> -i [prompt]`
- The `freshWorktree=true` path (createFeature, recreateImplementWorktree) is unchanged: just the fresh form, no chain.

Both halves of every chain preserve the exact display-name, config flag suffix, and initial-prompt argument so the user sees identical behavior whether the resume succeeds or the fresh fallback runs.

## Tests

Updated `tests/unit/WorktreeCoreAutoResume.test.ts`:

- Existing assertions for the non-fresh claude and codex command shapes now expect the `||`-chained command.
- Added `'switching to claude on a worktree previously used with codex still chains the fresh-launch fallback'` — the agent-switch scenario that motivated this item. Sets `lastTool=codex` on the worktree, then attaches with `aiTool='claude'`, and asserts the launch command is the chained form.

`npm test` (781 tests across 77 suites) and `npx tsc -p tsconfig.test.json` both pass.

## Notes for cleanup

- One launch helper now (`launchAISessionWithFallback`) instead of two. The old `launchClaudeSessionWithFallback` was deleted; its only Claude-specific bit (`-n displayName`) became an optional parameter on the unified helper.
- `AIToolService.launchTool` (`src/services/AIToolService.ts:181`) still launches `claude --continue` with no fallback. It is unused in production (`grep` shows no callers in `src/`), so it was left untouched. If a future caller wires it back up, the same fallback shape should be applied there.
- The fallback is intentionally silent — no extra UI/print line — so the user's pane just shows a working AI prompt whether the resume succeeded or not. Matches the original pre-`ca72a85` behavior and the user's preference confirmed during discovery.

## Stage review

Implementation matched the requirements one-to-one. After review feedback ("why is this separate from the others?"), the Claude-specific helper was folded into the unified `launchAISessionWithFallback` — the only Claude-specific concern (`-n displayName`) is now an optional trailing parameter, and the call site picks it only for `selectedTool === 'claude'`. Full suite (781 tests) and typecheck pass clean.
