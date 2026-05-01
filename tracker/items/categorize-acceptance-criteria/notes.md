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

## Findings

- **Generation site:** the prompt the agent reads is built in
  `src/services/TrackerService.ts:1483` —
  `'- **Acceptance criteria** — numbered testable conditions.'` — inside the
  `case 'requirements'` branch of `defaultStageFileContent`. Changing
  categorization is a template edit in this one place.
- **Renderer already handles it.** `render-markdown-nati` (already archived)
  shipped a native Ink markdown renderer that supports H3 sub-headings inside
  any section of `requirements.md`. No UI changes are required for grouped
  criteria to display correctly in `TrackerItemScreen` or the diff view.
- **Pattern already present organically.** Larger items have already started
  using `### Subsection` headers inside the Acceptance criteria block:
  - `tracker/items/ralph-phase-automation/requirements.md` — 10 sub-categories
    (Agent status metadata file, Input-mode setting, Gate settings, Nudge
    detection, Nudge delivery, Backoff & visibility, Safety invariants,
    Config & UI, Tests, Out of scope).
  - `tracker/items/item-s-status-json-s/requirements.md` and
    `tracker/items/terminal-ui-state-detection/requirements.md` use similar
    sub-section grouping.
  Most other items (e.g. `merged-item-stays-green`, `clean-up-style-tab`,
  `return-to-launcher-screen`, `preserve-kanban-selection`) are flat lists of
  5–8 items. Pattern emerges naturally as criterion count grows.
- **No validation impact.** `TrackerService.evaluateExitCriteria` only checks
  body length / file existence (`requirements_has_body`,
  `requirements_min_50_words`). Nothing parses the numbered list, so
  categorization is purely advisory — no code that walks AC structure breaks.
- **Stage settings already exist** for shaping `requirements.md`:
  `requirements.style` (`interview` / `draft_first`) and `requirements.detail`
  (`minimal` / `standard` / `thorough`). A categorization guideline can either
  be unconditional or gated on `detail`.

## Recommendation

Treat this as a single-point prompt change in `defaultStageFileContent` for the
`requirements` stage: replace the flat-list instruction with a directive that
groups criteria under H3 sub-headings by concern/area, with a few worked
examples in the prompt so the agent doesn't have to invent a vocabulary.

Open trade-offs to settle in Requirements:

1. **Always categorize, or only when many?** A 5-item list under one heading
   reads worse than a flat list. Likely answer: categorize when ≥ ~6 criteria,
   otherwise flat is fine — but make the agent decide rather than enforcing
   a numeric threshold.
2. **Numbering scheme.** Restart per category (`1.`, `2.`, ... within each H3)
   vs. continuous across categories (`1.`, `2.`, ... `33.` like
   `ralph-phase-automation` does today). Continuous is easier to reference
   in conversation; per-category is easier to read.
3. **Suggested vocabulary.** Provide a starter list (e.g., *Behavior*, *UI*,
   *Data / persistence*, *Tests*, *Safety invariants*, *Out of scope*) the
   agent can mix-and-match, vs. let the agent choose freely.
4. **Retroactive reorganization?** Out of scope for this item — forward-looking
   only. Existing flat-list `requirements.md` files stay as-is.
5. **Tie to `requirements.detail`?** Possibly only enforce categorization when
   `detail = thorough`; for `minimal` / `standard`, leave it optional.
