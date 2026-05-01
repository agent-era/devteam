---
title: "acceptance criteria should be categorized, easier to read than a flat list"
slug: categorize-acceptance-criteria
updated: 2026-04-30
---

## Problem

When the requirements-stage agent writes `requirements.md`, the generated
"Acceptance criteria" section is a flat numbered list. For non-trivial items
this turns into 10–40 criteria in a single block, mixing concerns (data model,
UI, tests, safety invariants, config) into one wall of numbers. Hard to skim,
hard to review, hard to reason about coverage per area.

## Why

Tracker items are reviewed in two surfaces — `TrackerItemScreen` (the in-app
markdown view) and PR review on GitHub. Both render `requirements.md`
directly. A flat list of 30+ criteria forces the reviewer to hold the
section taxonomy in their head while scanning. Several existing items have
already started organising criteria under `### subsection` headers
organically (e.g., `tracker/items/ralph-phase-automation/requirements.md`,
`tracker/items/item-s-status-json-s/requirements.md`), which proves the
pattern works and is desired — but the requirements stage prompt does not
ask for it, so most items still ship as flat lists. Codifying the pattern in
the prompt keeps new items consistent with the practice that's already
emerging.

The native Ink markdown renderer (added by `render-markdown-nati`) already
renders H3 headings inside any section, so this is a single-point prompt
change with no UI work required. Exit-criteria evaluation is also
content-agnostic (`TrackerService.evaluateExitCriteria` only checks word
count / file existence), so categorization stays advisory and breaks no
existing logic.

## Summary

Edit `defaultStageFileContent` for the `requirements` stage in
`src/services/TrackerService.ts` so the generated stage guide instructs
the agent to **group acceptance criteria under H3 sub-headings, by the
agent's own judgment of when grouping helps**, with **continuous numbering
across categories**. The agent invents the category names per item — no
fixed vocabulary is imposed. The instruction is one short paragraph; no
worked example is included in the generated guide (kept short on review
feedback — the prose is unambiguous on its own). No other sections of
`requirements.md` change:
`Edge cases`, `Constraints`, `Dependencies`, and `Out of scope` remain
separate H2 sections under their existing detail-level rules.

Existing `requirements.md` files in the tree are left untouched — this is
forward-looking only.

## Acceptance criteria

1. The `case 'requirements'` branch of `defaultStageFileContent` in
   `src/services/TrackerService.ts` (around line 1480) replaces the line
   `'- **Acceptance criteria** — numbered testable conditions.'` with an
   instruction that tells the agent to (a) write criteria as a numbered
   list, and (b) **group them under `###` sub-headings when they span
   multiple distinct concerns**, otherwise leave them flat. The agent
   chooses the category names; no fixed vocabulary is enumerated in the
   prompt.
2. The instruction states explicitly that **numbering is continuous across
   categories** — i.e., `1.` … `N.` runs through every group from top to
   bottom, so any criterion can be referred to as "AC #N" unambiguously
   in conversation/PR review. This rules out per-category restart
   (`1.`/`1.`) and hierarchical (`1.1`, `2.3`) numbering.
3. The `### subsection` rule applies **only to the Acceptance criteria
   block**. The other H2 sections that the requirements stage already
   emits — `Edge cases` (when `detail !== 'minimal'`), `Constraints`,
   `Dependencies`, `Out of scope` (when `detail === 'thorough'`),
   `Summary`, `Problem`, `Why` — are unchanged in both wording and
   placement.
4. The change is purely additive to the prompt string. No new stage
   settings (no new entry in `STAGE_OPTION_DEFS` for the requirements
   stage), no changes to `evaluateExitCriteria`, no new exit criterion,
   no schema changes to `tracker/stages.json` or `tracker/work-style.json`.
5. The behavior is **independent of `requirements.detail`** and
   `requirements.style`: the categorization instruction is included in
   the prompt for all three detail levels (`minimal` / `standard` /
   `thorough`) and both styles (`interview` / `draft_first`). Detail
   continues to control the `minWords` floor and which extra H2 sections
   appear, exactly as today.
6. After this change, regenerating any project's stage guide via the
   existing `writeStagesProgressionSkillFiles` path produces a
   `requirements` section in the skill file that contains the new
   categorization instruction. The default-stages flow (`devteam` first
   run on a fresh project) also produces it.
7. Existing `tracker/items/<slug>/requirements.md` files are not
   rewritten or touched by this change. Only newly-generated stage
   guides reflect the new instruction; criterion categorization in
   already-shipped items remains whatever the original author wrote.
8. **Tests.** A unit test against `defaultStageFileContent('requirements',
   settings)` asserts the returned string contains: (a) a phrase
   instructing categorization under H3 sub-headings, scoped to the AC
   bullet, and (b) a phrase specifying continuous numbering across
   categories with the literal `AC #N` reference. The test runs across
   all six combinations of `style ∈ {interview, draft_first}` ×
   `detail ∈ {minimal, standard, thorough}` to confirm the instruction
   is present in all of them. Existing tests for
   `defaultStageFileContent` (whatever assertions they make about other
   stages or about word minimums) continue to pass unchanged.
9. `npm run typecheck` and `npm test` pass on the resulting branch.

## Out of scope

- **Retroactive reorganisation** of existing `requirements.md` files. They
  stay as-is.
- **Validation / linting** that an item's acceptance criteria actually use
  H3 headings or continuous numbering. The instruction is advisory; no
  exit-criterion check is added, no parser is written.
- **Per-stage settings** (a new `categorize` dropdown in `STAGE_OPTION_DEFS`).
  We're committing to the categorize-by-judgment behavior as the default
  for everyone; if it turns out to be wrong, we can add a knob later.
- **A fixed category vocabulary.** The prompt deliberately does not
  enumerate category names — the agent invents them per item.
- **Changing the structure of any other section** (`Problem`, `Why`,
  `Summary`, `Edge cases`, `Constraints`, `Dependencies`,
  `Out of scope`).
- **Touching the discovery, implement, or cleanup branches** of
  `defaultStageFileContent`.
