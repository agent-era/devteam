# Implementation

Refined the tracker generation model so there is now one concise generated skill artifact instead of persisted `tracker/stages/*.md` files.

Built a single tracker artifact regeneration path in `TrackerService` so stage-related config changes now rewrite:

- `.agents/skills/stages-progression/SKILL.md`
- `.claude/skills/stages-progression/SKILL.md`

Key decisions:

- Centered the generated workflow on one shared skill file at `.agents/skills/stages-progression/SKILL.md` for Codex and Gemini, with the same content mirrored into `.claude/skills` for Claude compatibility.
- Removed the runtime dependency on persisted `tracker/stages/*.md` and `working-style.md`. The stage config screen still uses the same generation helpers for preview, but the persisted artifact is now the skill file.
- Updated prompt construction and Ralph nudges to point agents at the generated skill instead of `tracker/stages/<stage>.md`.
- Reworked `editStageFileWithAI()` so it edits the stage config object that drives the generated skill, rather than trying to edit a stage markdown file on disk.
- Simplified `TrackerStagesScreen` by removing direct file writes; the service now owns regeneration.

Verification:

- `npm test -- --runInBand tests/unit/tracker.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm test`

Notes for cleanup:

- `TrackerService` still contains helper methods named around stage files (`defaultStageFileContent`, `ensureStageFiles`, `getStageFilePath`) because the stage config UI still reuses those renderers internally. They are no longer the source of persisted guidance.

## Stage review

Collapsed tracker guidance into one generated skill file and removed the remaining behavioral dependency on `tracker/stages`. Config changes from the stages screen now flow into the shared skill artifact, and the full test suite, typecheck, and build all pass on that model.
