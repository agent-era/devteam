## What was built

A 3-commit bundle of fixes that turns the curated 9 raw observations from `ralph-tmux-codex-test` into 4 product fixes (originally 5 — the codex pane-state detector fix landed independently in `main` while this branch was open, so the related observations are already covered without changes here). The two remaining unaddressed observations are intentionally out of scope per requirements.

| # | Commit | Closes ralph-tmux-codex-test finding | Files |
|---|---|---|---|
| 1 | `fix(git): create worktree on local-only repos with no origin remote` | #1 | `src/services/GitService.ts`, `tests/unit/git-worktree-creation.test.ts` |
| 2 | `fix(sessions): launch fresh AI in just-created worktrees, drop unused fallback` | #2, #3 | `src/cores/WorktreeCore.ts`, `src/contexts/WorktreeContext.tsx`, `src/screens/CreateFeatureScreen.tsx`, `src/App.tsx`, `tests/unit/WorktreeCoreAutoResume.test.ts` |
| 3 | `fix(tracker): propagate worktree suffix through tracker slug + sessions` | #8 | `src/services/TrackerService.ts`, `src/App.tsx`, `tests/unit/tracker.test.ts` |

## Key decisions

- **No probing for resumable Codex sessions** (fix #1/#4 in requirements). Used an `isNewWorktree`-style flag (`opts.freshWorktree`) threaded from the two creator paths (`createFeature`, `recreateImplementWorktree`) through `attachSession` / `launchSessionBackground` into `launchAISessionWithFallback` / `launchClaudeSessionWithFallback`. When set, launches fresh (no `--continue` / `--last`). When unset, trusts a prior session exists and uses the resume form directly — no `||` fallback chain.
- **Removed the resume-or-fresh `||` chain in the non-fresh path.** The chain is what produced the noisy `No saved session found with ID …` flash on first launches. Per the user's intent, the existing-worktree path now just resumes, and only the freshly-created-worktree path goes fresh. The chain that was previously in the no-prompt path of `launchAISessionWithFallback` was actually missing — finding #2 from the source list — so removing chains entirely simplified the helper into a single `cmd` based on `freshWorktree`.
- **Slug propagation via runtime rename, not pre-emption.** Implemented `TrackerService.renameItem(projectPath, oldSlug, newSlug)` that moves the slug across stage buckets, migrates the `sessions` metadata entry, renames the on-disk `tracker/items/<slug>/` directory, and rewrites the `slug:` frontmatter line in any `.md` files. `App.ensureItemWorktree` calls this when `recreateImplementWorktree` returns a worktree whose `feature` differs from the requested slug. Did not extend `deriveSlug` to consider existing branch names — the rename approach catches all drift cases including drift that shows up after item creation, and is one self-contained code change rather than two.
- **Codex pane-state detection (originally fix #3) was dropped after rebase onto `main`.** Main landed `33c4a71 terminal ui state detection (#228)` while this branch was open. That commit reorganised `getStatusForTool` to detect codex permission pickers via `/press enter to confirm/i` and `/would you like to run/i` (waiting-first ordering, with the working spinner allowed to coexist with a permission dialog). My original regex (`CODEX_MODAL_RE` for trust / sandbox-retry / usage-limit / model-switch substrings) reproduced as a false-positive against the existing fixtures because those modals stay in scrollback after dismissal — matching the substring anywhere in the pane misclassifies idle/working as waiting. Main's picker-based approach is the correct shape; my fix collapsed to a no-op given that detector and was dropped during rebase. Trust-prompt-while-active is partially covered by main's `Press enter to continue` affordance not being matched today; that's a follow-up for whoever extends the picker patterns.
- **Trusted `findBaseBranch`'s return value as-is** instead of re-prefixing with `origin/`. The previous code synthesised `origin/main` even when `findBaseBranch` had already fallen back to a local `main` (because no `origin` was available), which is exactly what made local-only repos fail.

## Verification

- `npx tsc -p tsconfig.test.json --noEmit` — clean.
- `npx tsc -p . --noEmit` — clean.
- `npm test` — 757 tests pass across 76 suites.
- Tests added/updated:
  - `git-worktree-creation.test.ts` — new test for local-only repo (no `origin`); replaced "should handle local base branch by prefixing" with the inverted assertion (no synthetic prefix).
  - `WorktreeCoreAutoResume.test.ts` — replaced the old fallback-chain expectation with `claude --continue` only; added two new cases for `freshWorktree=true` (claude → no `--continue`, codex → no `resume --last`).
  - `tracker.test.ts` — four new `renameItem` cases (index buckets + sessions migration, dir rename + frontmatter rewrite, collision rejection, unknown-slug rejection).

## Status of original ralph-tmux-codex-test findings

| Finding | Status |
|---|---|
| #1 Fresh local-only repo cannot create tracker worktrees | **Closed** by commit 1 |
| #2 Attach session broken for fresh Codex worktrees | **Closed** by commit 2 (via `freshWorktree=true` from `createFeature`) |
| #3 Stage-prompt launch shows `No saved session found` error | **Closed** by commit 2 (no resume command issued at all on fresh worktrees) |
| #4 First-run Codex trust prompt blocks stage execution | **Closed for visibility (partial)** — main's `33c4a71` recognises the codex permission picker via `Press enter to confirm` / `Would you like to run`. The trust prompt's `Press enter to continue` affordance isn't matched yet; flagged as a follow-up. |
| #5 Sandbox-retry prompts delay status accuracy | **Closed for visibility** — when active, the sandbox-retry shows the picker affordance and main's detector treats it as `waiting`. |
| #6 `waiting_for_input` lags behind real blocked state | **Out of scope** (agent-side write timing, per requirements). Mitigated by main's pane-state detection. |
| #7 Implement sessions blocked by usage/model prompts show as active/idle | **Open** — main's picker patterns don't match the `usage limit` / `switch model` modals, and my CODEX_MODAL_RE was dropped because it false-positived on scrollback. Recommend a follow-up that adds active-prompt-only patterns once we have proper fixtures. |
| #8 Auto-suffixed worktree names diverge from tracker slugs | **Closed** by commit 3 |
| #9 Inline tracker-create input unreliable under PTY harness | **Out of scope** (likely environment-specific, per requirements) |

## Notes for cleanup

- The `WorktreeContext` interface picked up an `opts?: {freshWorktree?: boolean}` parameter on both `attachSession` and `launchSessionBackground`. The other call sites (`WorktreeListScreen.tsx`, `App.tsx` workspace flow) do not pass it; the default `undefined`/`false` preserves their previous behavior.
- `renameItem` only operates on the main project's `tracker/items/<slug>/`. The worktree's per-item dir is created on the *new* slug by the subsequent `ensureItemFiles` call, since the rename happens before that call. There is no cross-worktree migration needed.
- Findings #4 and #7 stay partially open (the detector area). A targeted follow-up tracker item should add fixtures for an active codex trust prompt, an active usage-limit modal, and an active model-switch modal, and extend the picker-pattern regex to match those active states.

## Stage review

Built the bundle, then rebased onto `main` after PR #228 landed. The codex modal regex in the original fix #3 collapsed under main's reorganised picker-based detector (it false-positived on scrollback against the fixture suite). The commit was dropped from the rebased history; the remaining 3 fix commits are clean. All 757 unit/E2E tests pass; typecheck and build are clean. Findings #4 and #7 are flagged as partially open follow-ups since proper detector coverage for those modals needs fixtures we don't have here.
