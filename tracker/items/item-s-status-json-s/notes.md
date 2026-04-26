---
title: Discovery — status.json should not be committed
slug: item-s-status-json-s
updated: 2026-04-26
---

## Problem

`tracker/items/<slug>/status.json` files are agent runtime state (current stage, working/waiting state, brief_description, ISO timestamp) that live inside the tracked `tracker/items/` tree. They are getting committed alongside real changes, producing diff noise on PRs and leaving stale snapshots in `main`. The user wants them gitignored, and asked where the rule (or enforcement) should live.

## Why it matters

Per the stages-progression skill, agents must update `status.json` "at every meaningful transition" — it's the canonical signal ralph and the kanban UI read to decide whether the agent is working, waiting for input, or waiting for approval. So the file churns constantly during normal work; timestamp + brief_description rewrite even when no decision was made. None of that belongs in commit history.

## Findings

1. **Files are tracked.** `git ls-files` lists 8 status.json files on this branch:
   - `tracker/items/{archive-kills-sessions,config-resets-clearing,merged-indicator-kanban,merged-item-stays-green,render-markdown-nati,running-status-chips,stages-progression-skill,terminal-ui-state-detection}/status.json`
   - History shows 10 distinct slugs have ever had a status.json committed; some have been touched by multiple PRs (render-markdown-nati = 4 commits, running-status-chips and merged-indicator-kanban = 3 each).
2. **No gitignore entry.** `.gitignore` covers `node_modules`, `.devteam`, `.claude`, build outputs — nothing for `tracker/items/*/status.json`.
3. **No skill or doc says "don't commit it".** The stages-progression skill (`.claude/skills/stages-progression/SKILL.md`, source: `tracker/stages.json` + the generator) repeatedly tells agents to update status.json but never warns them off committing it. The `/submit` skill (`/home/mserv/projects/devteam/.claude/skills/submit/SKILL.md`) calls `gh pr create --fill` after `/simplify`, no exclusion list. So whether status.json reaches a PR depends on whether the agent uses `git add <files>` (safe) or `git add -A` / `git add tracker/items/<slug>/` (picks it up). Both patterns appear in history.
4. **It's pure runtime state.** `TrackerService.writeItemStatus` (`src/services/TrackerService.ts:487`) atomically writes `{stage, state, brief_description, timestamp}`. Timestamp is `new Date().toISOString()` on every write — every commit that includes it bakes a wall‑clock timestamp into history.
5. **Tracked copies on `main` are stale snapshots.** They reflect whatever the state was when the PR was authored — typically `cleanup / waiting_for_approval`. They don't reflect post‑merge / archived state, so they're misleading even as a historical record.
6. **TrackerService writes status.json from two contexts.** From a worktree (the agent advancing through stages — `writeItemStatus` at line 487) and from the main project checkout (the user advancing via the kanban — line 580 mirrors the canonical stage). Only worktree writes get committed in practice (the main checkout is rarely git‑added); both go to the same `tracker/items/<slug>/status.json` path.
7. **Items with no worktree get a stub status.json materialised in the main repo** (lines 488–492 in `TrackerService.ts`). Same path, same gitignore implications.

## Recommendation

Two‑part, both small:

**1. Untrack and gitignore.**
- Add `tracker/items/*/status.json` to `.gitignore`.
- Run `git rm --cached tracker/items/*/status.json` once on the cleanup PR so the existing 8 tracked copies are removed from the index without deleting them on disk (ralph + kanban keep reading the local file).

**2. One‑line note in the skill source.**
- Add a sentence right next to the existing "keep status.json current" line in `tracker/stages.json` (the source of truth that generates `.claude/skills/stages-progression/SKILL.md` and `.agents/skills/stages-progression/SKILL.md`): *"status.json is gitignored runtime state — never commit or stage it."* That puts the rule where the agent reads the obligation it's about to break.

That's enough. `gitignore` is the mechanical enforcement (covers `git add <file>`, `git add -A`, `git add tracker/items/<slug>/`); the only escape is `git add -f`, which agents shouldn't be doing. The skill note explains the rule for humans skimming the source.

## Where the guidance lives — answering the explicit question

- **Mechanical enforcement → `.gitignore`.** Single source of truth. One line.
- **Pedagogical rule → `tracker/stages.json` (regenerated into the stages-progression skill).** Right beside the existing instruction to maintain the file.
- **Probably not needed:** AGENTS.md changes, pre‑commit hook, CI check, `/submit` skill clause. They duplicate what `.gitignore` already enforces and add maintenance.

## Open trade-offs (defer to requirements)

- Whether the cleanup also deletes status.json from disk on the main checkout (probably no — harmless; kanban renders fine when absent).
- Whether to also gitignore other ephemeral per‑item artifacts. None exist today. Punt unless the pattern broadens.
- Whether to add a belt‑and‑suspenders pre‑commit hook — recommend skipping unless the gitignore approach proves insufficient.
