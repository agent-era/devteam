---
title: Requirements — gitignore tracker/items/*/status.json
slug: item-s-status-json-s
updated: 2026-04-26
---

## Problem

`tracker/items/<slug>/status.json` files are agent runtime state (current stage, working/waiting state, brief_description, ISO timestamp) that live inside the tracked `tracker/items/` tree. They are getting committed alongside real changes, producing diff noise on PRs and leaving stale snapshots in `main`. The user wants them gitignored, and asked where the rule (or enforcement) should live.

## Why it matters

Per the stages-progression skill, agents must update `status.json` "at every meaningful transition" — it's the canonical signal ralph and the kanban UI read to decide whether the agent is working, waiting for input, or waiting for approval. So the file churns constantly during normal work; timestamp + brief_description rewrite even when no decision was made. None of that belongs in commit history.

## Summary

Stop committing per-item `status.json` files. Add one `.gitignore` entry, untrack the 8 currently-tracked copies (without deleting them on disk), and add a one-line rule to the generated stages-progression skill so agents reading the skill see it next to the existing "keep status.json current" instruction. No pre-commit hook, no `/submit` clause — `.gitignore` is the mechanical enforcement.

The skill text lives in `src/services/TrackerService.ts` (the `Agent status protocol` block around line 1310), so the rule lands there in TypeScript. Both `.claude/skills/stages-progression/SKILL.md` and `.agents/skills/stages-progression/SKILL.md` regenerate from that source.

## Acceptance criteria

1. `.gitignore` contains a new entry `tracker/items/*/status.json` (or equivalent pattern that matches every per-item status file). Running `git check-ignore tracker/items/<any-existing-slug>/status.json` on a fresh checkout reports it as ignored.

2. The 8 currently-tracked status.json files (listed in `notes.md` § Findings) are removed from the git index via `git rm --cached`, so `git ls-files | grep 'tracker/items/.*/status.json'` returns nothing on the resulting branch.

3. The on-disk copies of those 8 files are **not** deleted by this PR. After the change, `ls tracker/items/*/status.json` on the worktree still shows the existing files (untracked, but present), so ralph and the kanban keep reading them.

4. `git status` after running this branch's changes does not list any status.json under `Untracked files:` — the gitignore entry suppresses them.

5. The "Agent status protocol" template in `src/services/TrackerService.ts` (the block beginning `You must keep \`tracker/items/<slug>/status.json\` current.`) gains one sentence stating that status.json is gitignored runtime state and must never be committed or staged. The sentence is placed where an agent reading the skill cannot miss it — adjacent to or appended to that opening paragraph.

6. Both generated skill files (`.claude/skills/stages-progression/SKILL.md` and `.agents/skills/stages-progression/SKILL.md`) include the new sentence after regeneration. If a regen helper exists, it's run as part of this PR; if not, the generated files are updated to match the source.

7. No pre-commit hook is added. No `/submit` skill change is made. No CI check is added. `.gitignore` + the skill sentence are the entire enforcement surface.

8. No behavioural changes to `TrackerService.writeItemStatus`, `getItemStatus`, ralph polling, or the kanban: the file path stays at `tracker/items/<slug>/status.json`, the schema is unchanged, and a fresh write still creates the file (which gitignore does not block — gitignore only affects `git add`).

9. Existing unit tests in `tests/unit/tracker.test.ts` continue to pass. No new tests are required; the change is config + a documentation sentence.

## Edge cases / non-goals

- **Other ephemeral artifacts**: out of scope. None exist today; revisit if a new pattern appears.
- **Archived item history**: out of scope. We don't preserve a "last status" for archived items — that information is captured by the move into `archive` in `tracker/index.json`.
- **`git add -f tracker/items/<slug>/status.json`**: still works (gitignore can be overridden). Acceptable; agents shouldn't be force-adding ignored files, and the skill sentence makes the rule explicit if anyone tries.
- **Status writes from the main checkout** (e.g., the user advancing via the kanban triggers `TrackerService.writeItemStatus` mirroring the new stage): now also gitignored, so the user's local checkout will no longer show those writes in `git status`. Intended.
