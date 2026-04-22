---
title: "make a skill for the agent to take the change through stages progression. and the stages config should overwrite that skill file. it should probably be installed in the project directory (and symlinked if it's not checked in?)"
slug: stages-progression-skill
updated: 2026-04-22
---

# Requirements

## Problem

The tracker currently launches agents with a stage-specific prompt built from `tracker/stages/*.md`, but the editable stage configuration in `tracker/stages.json` is only loosely connected to those files. The user wants a dedicated "stages progression" skill that an agent can follow end-to-end, with the stage config acting as the source of truth for that skill, and with the skill living in the project so sessions in feature worktrees see the same instructions.

## Why

The current setup can drift: stage config, generated-looking stage markdown, and any future tool-specific agent instructions can all disagree. That makes tracker automation less reliable and increases maintenance cost. The feature should let the tracker own one canonical stage-progression definition and emit the project-local artifacts that Claude, Codex, and Gemini actually use.

## Summary

Add a generated "stages progression" compatibility layer that is derived from tracker config and emitted primarily into the project's shared `.agents/skills/` directory, with a Claude-specific `.claude/skills/` copy or wrapper only if needed for Claude compatibility. The implementation must keep `tracker/stages/*.md` in sync with `tracker/stages.json` and `tracker/work-style.json`, and generate the project-local skill artifacts from the same source. The goal is not to invent a new parallel config system; it is to make tracker config the single source of truth and have every emitted file be an overwriteable build artifact of that config.

## Acceptance Criteria

1. Editing stage settings or work style through tracker code regenerates the stage output files deterministically instead of leaving stale `tracker/stages/*.md` content behind.
2. The tracker has a single generation path that produces both the human-readable stage guides and the tool-facing project-local artifacts from the same inputs.
3. The primary generated skill is written to `.agents/skills/` so it is natively usable by Codex and Gemini.
4. The system asks the user to install or keep the generated skill in the project's `.agents/skills/` directory; if the directory is not checked into git, existing worktree setup can symlink `.agents` into feature worktrees.
5. Claude compatibility is handled with the smallest possible extra surface: if Claude does not discover or respect `.agents/skills/`, the tracker also generates a `.claude/skills/` version or wrapper for the same stages progression skill.
6. Generated tool-specific files are safe to overwrite from tracker config updates; the system treats them as derived artifacts, not hand-edited sources of truth.
7. When a project chooses not to check these skill directories into git, existing worktree setup can symlink the relevant project directories into feature worktrees instead of duplicating special-case propagation code.
8. The generated artifacts preserve the current tracker workflow semantics: stage progression guidance, status protocol, stage settings, and work style remain available to the agent in the emitted files.

## Edge Cases

- A project may use one of the supported tools but not the others; generation should degrade cleanly instead of requiring every tool surface to exist in advance.
- Tool-native locations are not identical across Claude, Codex, and Gemini; the implementation must support `.agents/skills` as the shared default and `.claude/skills` only when Claude compatibility requires it, without forking the underlying stage logic.
- If a generated file already exists with stale content, regeneration must replace it consistently rather than only writing on first creation.
- Existing prompt-building behavior should remain valid during migration so current tracker sessions do not break while the new artifacts are introduced.

## Constraints

- `tracker/stages.json` and `tracker/work-style.json` remain the canonical editable inputs.
- `tracker/stages/*.md` remain useful human-readable guides, but they are derived outputs and must stay in sync with config.
- Reuse the existing project/worktree symlink mechanism where possible instead of adding bespoke copy logic for stage artifacts.
- Keep the solution minimal: one generation pipeline, multiple output targets.
- Prefer the smallest set of generated targets that still matches official tool behavior; center on `.agents/skills` and only duplicate into `.claude/skills` when needed.

## Out of Scope

- Redesigning the overall tracker stage model or Ralph behavior.
- Creating a brand-new generic agent plugin framework beyond what is needed for these generated artifacts.
- Solving every possible third-party agent format; this item only needs Claude, Codex, and Gemini support.
