# Requirements — agent-shows-claude-not-codex

## Problem

When a worktree is running Codex (or Gemini), the kanban / status UI sometimes labels the agent as "Claude" instead of the tool that is actually attached. This was hit on this very branch: a Codex session launched with the tracker prompt for slug `agent-shows-claude-not-codex` is misdetected as `claude`.

## Why

`AIToolService.detectToolFromArgs` (`src/services/AIToolService.ts:86-100`) decides the tool by `argsLower.includes('claude' | 'codex' | 'gemini')` against the full `ps -o args=` output, with `claude` checked first. The args string for a fallback-chain pane is `/bin/sh -c "<resume> || <fresh>"`, so any `initialPrompt`, slug, install-path, or display fragment containing "claude" wins over the actually-running binary. Triggers seen: tracker prompts that quote a claude-bearing slug, codex installed under a path containing "claude", or any prompt text mentioning Claude.

## Summary

Replace the loose substring match in `detectToolFromArgs` with a binary-aware match — a word-boundary regex anchored on the executable token, so `claude` / `codex` / `gemini` are recognized only when they appear as a standalone token (start of string, after `/`, or after whitespace) and are followed by whitespace or end-of-string. Preserve the existing `.includes()` behaviour as a final fallback only when the strict pass returns `'none'`, so any quietly-correct legacy detections aren't regressed. Keep `isAIPaneCommand` unchanged. Add unit tests covering the broken cases and the bash-wrapper fallback shape.

## Acceptance criteria

### Detection correctness

1. Given `ps args` of `bash -c "codex resume --last 'agent-shows-claude-not-codex' || codex 'agent-shows-claude-not-codex'"`, `detectToolFromArgs` returns `'codex'`.
2. Given `ps args` of `bash -c "codex resume --last 'fix the claude bug' || codex 'fix the claude bug'"`, `detectToolFromArgs` returns `'codex'`.
3. Given `ps args` of `node /home/user/.claude-tools/codex/bin/codex resume --last`, `detectToolFromArgs` returns `'codex'`.
4. Given `ps args` of `bash -c "gemini --resume latest 'tame the claude noise' || gemini 'tame the claude noise'"`, `detectToolFromArgs` returns `'gemini'`.
5. Existing positive cases keep returning the same tool: `claude`, `/usr/bin/claude`, `node /usr/bin/codex`, `node /usr/bin/gemini` (matching today's `AIToolService.test.ts:43-67`).
6. When the strict pass finds no binary token, the function falls back to today's `.includes()` behaviour (claude → codex → gemini → none) and returns the same answer it does today, so any legacy invocation forms still resolve.
7. Args that match no tool — `bash`, `vim`, empty string — return `'none'`.
8. Matching is case-insensitive (e.g. `CLAUDE`, `/USR/BIN/CODEX` resolve correctly).

### Scope and non-changes

9. `isAIPaneCommand` is unchanged — its substring behaviour is intentional and used only for coarse pane shortlisting.
10. `getStatusForTool`, `isWorking`, `isWaitingForTool`, and `AI_TOOLS` config are unchanged.
11. No change to tmux launch, fallback chain, or `aiSessionMemory` behaviour.

### Tests

12. `tests/unit/AIToolService.test.ts` adds table-driven cases for ACs 1–4 and 7–8, plus an explicit case asserting that the legacy fallback path still resolves a "weird but historically-OK" args string (AC 6). Gemini gets parallel coverage to Codex: claude-in-prompt, claude-in-install-path, and the bash-wrapper resume-or-fresh shape.
13. The existing `detectAllSessionAITools` test continues to pass with no fixture changes.
14. `npm run typecheck` and `npm test` are green.
