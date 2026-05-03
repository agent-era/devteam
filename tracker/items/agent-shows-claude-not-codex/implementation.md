# Implementation — agent-shows-claude-not-codex

## What was built

Tightened `AIToolService.detectToolFromArgs` (`src/services/AIToolService.ts:86-117`) so that tool names inside a prompt, slug, or install path no longer outrank the actually-running binary.

**Two-pass detection:**
1. **Strict pass** — strip shell-quoted spans (`'...'`, `"..."`) from the lowercased args, then for each tool match a word-boundary regex `(?:^|[\s/])${tool}(?=\s|$)`. The binary is recognized only when it appears as a standalone token (start of string, after `/`, or after whitespace, and followed by whitespace or end of string).
2. **Loose fallback** — if the strict pass returns `'none'`, fall back to the original `.includes()` chain. Preserves any historically-correct legacy detection forms; latent bugs in the loose path were already there before this change.

**Non-changes:**
- `isAIPaneCommand` left as-is — it sees only the process command name (not full args), and its coarseness is intentional for pane shortlisting.
- `getStatusForTool`, `isWorking`, `isWaitingForTool`, and `AI_TOOLS` config unchanged.
- No tmux launch, fallback chain, or `aiSessionMemory` changes.

## Tests

Added 13 table-driven cases under `detectAllSessionAITools › disambiguates tool when args mention another tool name` in `tests/unit/AIToolService.test.ts`:

- Codex on a worktree slug containing "claude" (the live repro for this branch).
- Codex with a quoted prompt containing "claude" (shellQuote single-quotes any prompt with spaces).
- Codex installed under a path containing "claude".
- Gemini parallels (claude-bearing prompt; claude-bearing install path).
- Claude with quoted display name.
- Claude bash-wrapper resume/fresh shape.
- Case-insensitive variants (`CLAUDE`, `/USR/BIN/CODEX`).
- Non-tool processes (`bash`, `vim`) → `'none'`.
- Legacy fallback path (`someweirdtoolnameclaudethingembedded`) still resolves to `'claude'`.

Existing cases (`claude`, `/usr/bin/claude`, `node /usr/bin/codex`, `node /usr/bin/gemini`, the `detects AI tools across multiple sessions` fixture) all continue to pass.

## Key decisions

- **Quote stripping in the strict pass.** `shellQuote` always wraps args containing spaces in single quotes, so a prompt like `'fix the claude bug'` would otherwise space-border "claude" and the strict regex would still match it. Stripping `'...'` (and defensively `"..."`) in the strict-pass input cleanly removes prompt/display content from tool detection while leaving the binary tokens intact.
- **Strict-then-loose, not strict-only.** Per requirements decision: any quietly-correct legacy detection form (e.g. `someweirdtoolnameclaudethingembedded`) keeps resolving as it did. The fallback also gives us a safety net if the args shape ever changes in unexpected ways across platforms or tmux versions.
- **Test through `detectAllSessionAITools`.** `detectToolFromArgs` is private; rather than expose it for tests, the new cases drive it via the public path with mocked `tmux list-panes` + `ps` output. The existing test file already established that pattern.

## Test/typecheck status

- `npx jest tests/unit/AIToolService.test.ts` → 38/38 pass (13 new).
- `npx jest` (full suite) → 78 suites, 801/801 pass.
- `npx tsc -p tsconfig.test.json` → clean.

## Notes for cleanup

- Comment in the new function explains *why* (the bug) without restating *what* (the regex). Should survive a review pass.
- No documentation files reference `detectToolFromArgs`. README/AGENTS.md don't need updates.
- No new exports or public API surface — change is internal to `AIToolService`.

## Stage review

Strict-then-loose detection in `AIToolService.detectToolFromArgs`, single fix point. 13 new table-driven cases plus the original 9 still green; full suite (801 tests) and typecheck clean. No commits made yet — leaving that for cleanup so the user can decide on commit granularity.
