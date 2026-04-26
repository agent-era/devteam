## Problem

The exploratory campaign in `ralph-tmux-codex-test` produced nine concrete observations about the tracker + tmux + Codex flow. The user wants this item to turn that raw list into a curated set of fixes/improvements: which observations are real product bugs, which are agent-side, and what the smallest sensible code changes look like.

Source material:
- `../ralph-tmux-codex-test/tracker/items/ralph-tmux-codex-test/notes.md`
- `../ralph-tmux-codex-test/tracker/items/ralph-tmux-codex-test/requirements.md`
- `../ralph-tmux-codex-test/tracker/items/ralph-tmux-codex-test/implementation.md`

## Findings

I checked each of the nine observations against the current code on this branch. Numbering matches `implementation.md` in the source item.

### Confirmed product bugs (worth fixing)

1. **Local-only repo cannot create tracker worktrees** — STILL REPRODUCES.
   - `src/services/GitService.ts:245` runs `git fetch origin` unconditionally; output is not checked, so on a no-remote repo the failure is silent but spammy.
   - `src/services/GitService.ts:251-255` then forces an `origin/` prefix on the base branch (`originBase = baseBranch.startsWith('origin/') ? baseBranch : 'origin/${baseBranch}'`) and passes that to `git worktree add`. For a local-only repo, even though `findBaseBranch` (`src/shared/utils/gitHelpers.ts:24-27`) returns the local `main`, this code re-prefixes it and the worktree-add fails.
   - Smallest fix: skip the fetch when `git remote` is empty; if the resolved base branch came from local (no `origin/` prefix), don't add one.

2. **Plain attach is broken for fresh Codex worktrees** — STILL REPRODUCES.
   - `src/cores/WorktreeCore.ts:601-604` (no-prompt branch) runs `aiLaunchCommand(tool)` directly with **no `||` fresh fallback**. For codex, that command is `codex resume --last` (`src/constants.ts:88-97`). With no prior session in the worktree, this exits immediately and the tmux session dies.
   - The prompt branch already has a `${resumeCmd} || ${freshCmd}` fallback (line 623); the no-prompt branch needs the same.
   - Smallest fix: in the no-prompt branch, build a `resume-or-fresh` chain just like the prompt branch — and ideally for claude/gemini too, since the same shape applies.

3. **Stage-prompt launch flashes a noisy "No saved session found with ID …" error** — STILL REPRODUCES.
   - `src/cores/WorktreeCore.ts:612-613` runs `codex resume --last … || codex …`. The fallback works, but `codex resume --last` writes its error to the pane stderr before exiting, so the user sees the scary line every first launch.
   - Smallest fix: probe whether a resumable session exists before composing the command (e.g. `codex sessions list` / check the codex sessions dir under the worktree), and only emit `resume --last` when one exists; otherwise launch fresh directly.

4. **Codex blocking states (trust prompt, sandbox-retry, usage/model prompts) aren't detected as "waiting"** — STILL REPRODUCES. (This collapses ralph-tmux-codex-test findings #4, #5, and #7 — they all share one root cause.)
   - `src/services/AIToolService.ts:134-136`: codex's `isWaitingForTool` is just `text.includes('▌') && !text.includes('⏎ send')`. The trust prompt, the "retry without sandbox?" sandbox prompt, the usage-limit notice, and the model-switch prompt all render full-screen modal text without the `▌` chat-input cursor, so they fall through to `idle`.
   - The board therefore shows these sessions as idle even though Codex is blocked, and ralph won't surface them as waiting either.
   - Smallest fix: add codex-specific markers to `isWaitingForTool` for the well-known modal text — at minimum strings like `"Do you trust"`/`"Trust this folder"`, `"retry without sandbox"`, `"usage limit"`, `"switch model"`. Update `tests/fixtures/ai-states/` (the `capture-ai-states` skill handles this) so the detector tests cover the new patterns.

5. **Auto-suffixed worktree names diverge from the tracker slug** — STILL REPRODUCES.
   - `src/cores/WorktreeCore.ts:298-310`: when a branch with the requested name already exists, `createFeature` walks `feature-2`, `feature-3`, … and creates the worktree under that suffixed name. The function returns a `WorktreeInfo` whose `feature` is the suffixed string — but the tracker slug that was passed in to launch the stage stays the original (e.g. `export-pending-tasks`).
   - Downstream code that assumes `slug === featureName === sessionName` (tmux session naming, status.json mirror lookup, board <-> worktree resolution) silently drifts.
   - Smallest fix: when the launch is initiated for a tracker item, refuse the suffix and fail loudly so the user resolves the conflict (e.g. archive the stale branch). Alternatively, propagate the suffixed slug back into the tracker item — but that's invasive and probably the wrong call.

### Agent-behavior, not code (don't fix here)

6. **`waiting_for_input` lags behind the agent's actual blocked state.**
   - This is mostly about the agent writing `status.json` *before* it actually blocks. There is no detection layer the code can add that wouldn't be racing the agent's own writes.
   - Partial mitigation already exists once finding #4 is fixed: the pane-based detector (`AIToolService`) will at least report the session as `waiting` for the board, even if `status.json` is stale.

### Environment / out-of-scope

7. **Inline tracker-item create input is unreliable under PTY-harness keystroke injection.**
   - `src/screens/TrackerBoardScreen.tsx:387-396` looks correct; the original author called this out as likely environment-specific. Skip unless we can repro from a real terminal.

## Recommendation

Treat this item as a small, focused bug-fix bundle of five concrete fixes, in roughly this priority order:

1. **Fix codex plain-attach (no-prompt path)** — single-line shape change in `WorktreeCore.launchAISessionWithFallback`, highest user-visible impact.
2. **Fix local-only repo worktree creation** — small `GitService.createWorktree` change; unblocks the disposable-sandbox flow the test campaign needed.
3. **Improve codex pane-state detection for trust / sandbox / usage / model prompts** — `AIToolService.isWaitingForTool`, plus refreshed fixtures via the `capture-ai-states` skill.
4. **Avoid the spammy `codex resume --last` error on first prompted launch** — probe for a resumable session before issuing `resume --last`.
5. **Make slug/worktree drift loud** — `createFeature` should refuse-and-fail when called for a tracker item whose slug already collides, instead of silently suffixing.

Findings #6, #5(sandbox), and #4(trust) from the source list collapse into fix #3 here, and finding #9 is parked as environment-specific. That gives a tight scope: five small, independent commits, all in `src/services/` and `src/cores/`, with detector-fixture and unit-test updates only where the existing tests cover the changed predicate.

Open question to confirm with the user before writing requirements: should fix #5 (slug-drift) be in scope, or should we descope it to its own follow-up since it's the most invasive of the five?
