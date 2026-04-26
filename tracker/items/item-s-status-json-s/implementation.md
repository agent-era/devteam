---
title: Implementation — gitignore tracker/items/*/status.json
slug: item-s-status-json-s
updated: 2026-04-26
---

## What was built

Three small changes, single PR:

1. **`.gitignore`** — added `tracker/items/*/status.json` with a 4-line comment explaining what it is and why it's ignored. Placed in the project-specific section after `.devteam` / `.cpuprofile`.

2. **`src/services/TrackerService.ts`** — appended one bolded paragraph to the `Agent status protocol` block (around line 1313, inside the protocol body that gets emitted into every stage section of every regenerated SKILL.md):

   > **Never commit or stage `status.json`** — it's gitignored runtime state. Each write rewrites the timestamp, so committing it bakes wall-clock churn into history.

   Placed right after the existing "canonical live state" paragraph and before the `Schema:` block, so the rule lands where the agent first reads the file's purpose. Both `.claude/skills/stages-progression/SKILL.md` and `.agents/skills/stages-progression/SKILL.md` regenerate from this source via `writeStagesProgressionSkillFiles` (called from `ensureStageFiles`, `saveWorkStyle`, `saveStagesConfig`); neither generated file is tracked in git, so no extra commit needed for them.

3. **`tests/unit/tracker.test.ts`** — added one assertion to the existing `defaultStageFileContent renders status + gate protocol` suite: every stage's emitted content must contain ``Never commit or stage `status.json` ``. This guards against accidental removal during future skill-text edits.

## Untracking the 8 already-committed copies

Ran `git rm --cached` on each of the 8 status.json files identified in `notes.md` § Findings (archive-kills-sessions, config-resets-clearing, merged-indicator-kanban, merged-item-stays-green, render-markdown-nati, running-status-chips, stages-progression-skill, terminal-ui-state-detection). The `--cached` flag drops them from the index without touching the worktree files, per AC3.

`git ls-files 'tracker/items/*/status.json'` is now empty. `git check-ignore` confirms both an existing untracked `status.json` (e.g. `render-markdown-nati`) and a newly-written one (this item's own `status.json`) match the new pattern.

## Key decisions

- **Sentence wording.** Bolded `Never commit or stage` so it stands out at the top of the protocol section. Included the *why* (timestamp churn) so the rule isn't cargo-culted.
- **Placement.** New paragraph between the existing intro and the `Schema:` block — gives the rule visual weight without breaking the flow of the explanation. Alternative was inlining into the opening sentence; rejected because the sentence is already long.
- **Did not add a `/submit` clause or pre-commit hook.** Per requirements AC7, gitignore is the only mechanical enforcement.
- **Did not delete on-disk copies.** Per AC3 / user choice "Untrack only — keep files on disk".
- **Did not regenerate the SKILL.md files in this commit.** They're not git-tracked anywhere (`.claude/` is in `.gitignore`; `.agents/` is currently untracked in the parent repo). They will regenerate locally next time the user opens the stages screen, advances an item, or otherwise triggers `ensureStageFiles` → `syncGeneratedTrackerArtifacts`.

## Notes for cleanup

- Verify `git status` on a clean checkout doesn't show any `status.json` under "Untracked files".
- Verify the new test assertion runs (`npx jest tests/unit/tracker.test.ts -t "every stage includes the status.json protocol section"`).
- Optional: trigger a regen of the SKILL.md files in the local checkout (e.g. by saving the work style from the Style tab, or just running the typecheck which exercises the codepath via tests) to confirm the new sentence renders. Not required for the PR — generated files aren't tracked.

## Test + typecheck

- `npx jest tests/unit/tracker.test.ts` → 138/138 passing (includes the new assertion).
- `npx tsc -p tsconfig.test.json --noEmit` → clean.
- Full `npx jest` had 3 unrelated pre-existing flaky e2e failures (project-filter.test.tsx among them) that pass when run in isolation; not caused by this change.

## Stage review

Implemented as scoped: `.gitignore` + `git rm --cached` + a one-paragraph addition to the protocol generator + a test assertion. No surprises during implementation; the skill regen path turned out to be a non-issue because the generated SKILL.md files aren't git-tracked. No deviations from requirements.
