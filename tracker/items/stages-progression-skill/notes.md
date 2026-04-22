## Problem

The tracker currently launches agents with a stage-specific prompt built from `tracker/stages/*.md`, but the editable stage configuration in `tracker/stages.json` is only loosely connected to those files. The user wants a dedicated "stages progression" skill that an agent can follow end-to-end, with the stage config acting as the source of truth for that skill, and with the skill living in the project so sessions in feature worktrees see the same instructions.

## Findings

- `TrackerService.buildPlanningPrompt()` does not embed stage instructions directly. It points the agent at `tracker/stages/<stage>.md`, `tracker/stages/overview.md`, and `tracker/stages/working-style.md`, so whatever we build needs to line up with that prompt contract.
- `TrackerService.defaultStageFileContent()` already knows how to derive stage instructions from structured settings plus work style, but `ensureStageFiles()` only writes stage files when they are missing. That means `tracker/stages.json` is not actually the canonical source after first creation.
- The UI partly compensates for this drift manually. `TrackerStagesScreen.tsx` rewrites the selected stage file when stage settings change, and rewrites all stage files when `inputMode` changes. Other paths such as `saveStagesConfig()` and AI config editing do not regenerate stage files, so the coupling is incomplete and easy to break.
- There is already an established per-project worktree propagation mechanism: `worktreeSetup.symlinkPaths` in `.devteam/config.json`, implemented by `WorktreeCore.setupWorktreeEnvironment()` and `GitService.symlinkPath()`. That is the clean existing hook for "install in project dir and symlink into worktrees if needed".
- Tool-specific project-local instruction surfaces are real, but they are not identical:
  - Claude Code officially supports project `CLAUDE.md` files and project skills under `.claude/skills/`.
  - Codex officially supports repo-scoped skills under `.agents/skills/`, scanned from the current working directory up to repo root, and explicitly supports symlinked skill folders.
  - Gemini CLI officially supports workspace skills in `.gemini/skills/` and also supports `.agents/skills/` as an alias; Gemini docs say the `.agents/skills/` alias takes precedence over `.gemini/skills/` within the same tier.
- Because of that mismatch, "use the per-project skills directories" is best interpreted as "use each tool's native project-local reusable-instruction location", not "force the same `SKILL.md` path shape for all three tools".

## Recommendation

Use stage config as the source of truth, but generate native per-tool project-local artifacts rather than one universal skill path.

Recommended shape:

- Generate the tracker stage guides from config as before, but also emit tool-facing wrappers in project-local locations:
  - Shared primary target: `.agents/skills/stages-progression/SKILL.md`
  - Claude compatibility target only if needed: `.claude/skills/stages-progression/SKILL.md`
- Generate those wrappers from the same source data that currently generates `tracker/stages/*.md`: stage settings from `tracker/stages.json`, work style from `tracker/work-style.json`, and the tracker stage protocol text.
- Keep `tracker/stages/*.md` as human-readable stage guides, but generate them from the same pipeline so they cannot drift from the tool artifacts.
- Ask the user to install or check in the shared skill under the project's `.agents/skills/` directory. If the project chooses not to check it in, reuse the existing `worktreeSetup.symlinkPaths` support to link `.agents` into each feature worktree.
- Only add `.claude/skills/` when Claude does not respect the shared `.agents/skills/` location in practice.

Why this direction:

- It preserves the current prompt contract instead of replacing it wholesale.
- It makes one source of truth generate both the per-stage docs and the tool-native reusable instructions.
- It reuses the repo's existing symlink machinery instead of adding another propagation system.
- It keeps the default footprint smaller by centering on one shared skill directory for Codex and Gemini, with Claude-specific duplication only as a fallback.

Open point for requirements:

- Decide whether devteam should launch agents by pointing them at the generated tool-native wrapper first, or keep the current tracker prompt and use the wrappers as a shared compatibility layer. The compatibility-layer approach is lower risk because it keeps current prompt and test expectations more stable.
