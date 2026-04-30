# Discovery — claude-launch-fallback

## Problem

When devteam attaches to an existing worktree, it launches Claude with `claude --continue` so the prior on-disk session resumes. Sometimes `claude --continue` fails (no resumable session, or claude exits nonzero) and the tmux pane is left empty — the user gets no Claude at all and has to restart manually.

The user reports this happens specifically **when switching which agent is used on a worktree** (e.g. previously used codex → now picking claude). In that case there is no prior claude session to continue from, so `claude --continue` exits and there is no fallback.

## Findings

- The launch site is `WorktreeCore.launchClaudeSessionWithFallback` (`src/cores/WorktreeCore.ts:599`). Despite the name, **it no longer has a fallback**. The current command is just `claude --continue …` with no `||` chain.
- The fallback was deliberately removed on 2026-04-26 in commit `ca72a85` ("fix(sessions): launch fresh AI in just-created worktrees, drop unused fallback"). That commit also threaded a `freshWorktree` flag from the create-feature paths so newly-created worktrees skip `--continue` entirely (no resume to fall back from).
- Before `ca72a85`, the launch was `claude --continue … || claude …` — exactly the backup the user is now asking to restore. Codex/Gemini had analogous `resume || fresh` chains and lost theirs in the same commit.
- The `freshWorktree=true` path (createFeature, recreateImplementWorktree) is a non-issue: it already launches plain `claude` and never uses `--continue`. The regression only affects the `freshWorktree=false` path — the **plain attach-to-existing-worktree** flow, which is also the most common one.
- The stated reason in `ca72a85` for dropping the chain: "trust that a prior session exists and use the resume form without a fallback chain." The user's report is empirical evidence that this trust is misplaced — `--continue` does still fail in some scenarios on existing worktrees. The most concrete trigger: **agent switch on an existing worktree**. `createSessionIfNeeded` (`src/cores/WorktreeCore.ts:384`) accepts an explicit `aiTool` argument, but the `freshWorktree` flag is only set on the create-worktree paths. If the user previously ran codex on this worktree and now picks claude, `selectedTool='claude'` and `freshWorktree=false` — so the launch is `claude --continue` even though no claude session has ever existed in this cwd.
- Existing test `tests/unit/WorktreeCoreAutoResume.test.ts:56` asserts the exact non-fresh command shape — restoring the fallback will require updating that expectation (and is a good place to add a test for the fallback chain itself).

## Recommendation

Restore the `||` shell-level fallback for the **non-fresh** Claude launch only:

```
claude --continue … || claude …
```

Keep the `freshWorktree=true` path as-is (plain `claude`, no `--continue`). This narrowly reverts the regression without re-introducing the noisy first-launch error that motivated `ca72a85`.

Open question for requirements:
- Should the same fallback be restored for codex (`resume --last || fresh`) and gemini (`--resume latest || fresh`) on the non-fresh path? The user's report only mentions Claude, but the codex/gemini paths have the identical structural risk and lost their fallback in the same commit.
