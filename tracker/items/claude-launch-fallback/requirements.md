# claude-launch-fallback

## Problem

When devteam attaches to an existing worktree, it launches Claude with `claude --continue` so the prior on-disk session resumes. Sometimes `claude --continue` fails (no resumable session, or claude exits nonzero) and the tmux pane is left empty — the user gets no Claude at all and has to restart manually.

The user reports this happens specifically **when switching which agent is used on a worktree** (e.g. previously used codex → now picking claude). In that case there is no prior claude session to continue from, so `claude --continue` exits and there is no fallback.

## Why

A failed AI launch in a tmux session is a dead end for the user — the pane sits empty, devteam thinks the session is fine, and the user has to manually kill and restart. The launch helpers in `WorktreeCore` are still named `launchClaudeSessionWithFallback` / `launchAISessionWithFallback`, and the whole point of those helpers — gracefully recovering when the resume form fails — was lost when commit `ca72a85` (2026-04-26) dropped the `||` chain. Restoring the chain on the non-fresh path is a narrow, well-scoped fix that puts the helpers back in line with their names.

## Summary

Restore the shell-level `resume-or-fresh` fallback for all three AI tools (claude, codex, gemini) on the **non-fresh attach** path in `WorktreeCore`. When `freshWorktree=false`, build the launch command as `<resume-form> || <fresh-form>` so that if the resume form exits nonzero, tmux falls through to a clean fresh session in the same pane. Leave the `freshWorktree=true` path (createFeature, recreateImplementWorktree) untouched — it already launches the fresh form directly and never tries to resume. The fallback runs silently; the user just sees a working AI prompt.

## Acceptance criteria

1. On the non-fresh attach path, `launchClaudeSessionWithFallback` produces a tmux command of the form `claude --continue <name+flags+prompt> || claude <name+flags+prompt>`. The fresh form preserves the same display-name (`-n`), flag suffix, and initial-prompt argument as the resume form.
2. On the non-fresh attach path, `launchAISessionWithFallback` produces a tmux command of the form `<resume-form> || <fresh-form>` for both codex and gemini, where the resume and fresh forms each preserve the existing prompt-argument shape (`codex resume --last [PROMPT]` vs `codex [PROMPT]`; `gemini --resume latest -i [PROMPT]` vs `gemini -i [PROMPT]`).
3. On the **fresh** path (`freshWorktree=true`), the launch command is unchanged from today: just the fresh form, no `||` chain.
4. The agent-switch scenario works: with a worktree that previously ran codex and a tmux session not yet open, calling `attachSession(wt, 'claude')` results in a tmux pane that ends up at an interactive Claude prompt (because `claude --continue` exits and `claude` runs).
5. Existing test `tests/unit/WorktreeCoreAutoResume.test.ts` is updated so the non-fresh assertions match the new `||`-chained command shape, and a new test covers the agent-switch scenario (previously codex, now claude on the same worktree path → final command includes the `claude … || claude …` chain).
6. The `npm run build` and `npm test` suites pass.
