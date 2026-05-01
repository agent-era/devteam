---
title: "acceptance criteria should be categorized, easier to read than a flat list"
slug: categorize-acceptance-criteria
updated: 2026-04-30
---

## What was built

A single-point change to the requirements-stage prompt template in
`src/services/TrackerService.ts`. The `case 'requirements'` branch of
`defaultStageFileContent` (~line 1480) now instructs the agent to:

- Group acceptance criteria under `###` sub-headings when they span
  multiple distinct concerns; otherwise keep the list flat. The choice
  is left to the agent's judgment — no numeric threshold.
- Number criteria **continuously** across categories (1 … N from top to
  bottom) so any criterion can be unambiguously referenced as "AC #N".
- Invent its own category names per item — no fixed vocabulary.

## Files changed

- `src/services/TrackerService.ts` — extended the `Acceptance criteria`
  bullet inside the `requirements` branch of `defaultStageFileContent`
  to carry the categorization guidance.
- `tests/unit/tracker.test.ts` — added a parametrised describe block
  (`requirements stage instructs the agent to categorize acceptance
  criteria`) covering all six combinations of
  `style ∈ {interview, draft_first}` × `detail ∈ {minimal, standard,
  thorough}`. Each case asserts presence of the H3 instruction, the
  "continuous numbering" phrase, and the literal `AC #N` reference.

## Key decisions

- **No new stage setting.** Categorize-by-judgment is the default for
  everyone, with no `STAGE_OPTION_DEFS` knob. Easy to add later if it
  turns out to be wrong; until then the prompt surface area stays small.
- **No validation / linting.** The instruction is advisory.
  `evaluateExitCriteria` was left untouched and no parser walks the AC
  block. This matches the user's preference (per the AC #5 in
  `requirements.md`) and avoids bolting a parser onto a content
  convention.
- **Independent of `requirements.detail`.** The categorization instruction
  fires for `minimal`, `standard`, and `thorough` alike. `detail`
  continues to control only the `minWords` floor and which extra H2
  sections (Edge cases, Constraints, Dependencies, Out of scope) appear.
- **Other sections untouched.** `Problem`, `Why`, `Summary`, `Edge
  cases`, `Constraints`, `Dependencies`, and `Out of scope` keep their
  current shape and placement. Scope intentionally narrow.
- **No retroactive rewrite.** Existing `tracker/items/*/requirements.md`
  files are not touched. Forward-looking only.

## Verification

- `npm test` — 786 passing across 77 suites, including the 6 new
  parametrised cases.
- `npm run typecheck` — clean.
- Manual preview via `node --input-type=module -e "..."` confirms the
  generated `requirements` stage guide renders the new instruction
  inline with the example fenced code block.

## Notes for cleanup

- Git status: `src/services/TrackerService.ts` and
  `tests/unit/tracker.test.ts` are modified; `tracker/items/categorize-
  acceptance-criteria/{notes,requirements,implementation}.md` are new
  files. `status.json` is gitignored. Nothing committed yet — commit
  policy is to wait for explicit user request.
- The kanban index update (moving the slug from `requirements` to
  `implementation.implement`) lives in the parent devteam repo
  (`../../devteam/tracker/index.json`), not this worktree, so it isn't
  part of this branch's diff.

## Stage review

Single-file prompt edit + parametrised unit test. All 786 tests pass and
typecheck is clean. No behavior change to any code path other than the
text the requirements stage agent reads when generating
`requirements.md`.
