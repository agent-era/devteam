---
title: Split DiffView.tsx (1302 lines) into focused subcomponents
slug: split-diffview-tsx-1
updated: 2026-04-19
---

## What

`src/components/views/DiffView.tsx` is 1302 lines. It currently mixes diff parsing, side-by-side conversion, view-mode/wrap-mode state, comment management, prompt formatting, keyboard handling, and rendering in a single component.

Split it into focused subcomponents and modules so each has a single responsibility.

## Why

- Hard to navigate and reason about — finding any specific behaviour means scanning through unrelated logic
- Changes risk regressions because state and rendering are tightly coupled
- Difficult to unit-test individual pieces (e.g. `convertToSideBySide`, comment formatting) when they live in the same module as the React component
- Recent diff features (syntax highlighting, gutter colours, header styling — see commits `e8114be`, `6dd9929`) keep adding to the same file

## User stories

- As a maintainer of devteam, I want `DiffView.tsx` split into smaller modules so that I can find and change diff behaviour without scanning a 1300-line file.
- As a maintainer adding diff features (syntax highlighting, gutter colours, etc.), I want clear extension points so that new features land in the right place instead of growing the monolith.
- As a contributor writing tests, I want pure diff utilities to live in their own modules so that I can unit-test them without importing a React component and its dependency tree.

## Summary

Split `src/components/views/DiffView.tsx` (1302 lines) into a `views/diff/` subfolder of focused subcomponents and hooks, plus pure utility modules under `src/shared/utils/diff/`. Pure refactor — zero behaviour change. Each existing test must pass; new unit tests cover the extracted pure utilities directly.

## Target file layout

```
src/
  components/views/
    DiffView.tsx                          (orchestrator, <300 lines)
    diff/
      UnifiedDiffRows.tsx                 (unified-mode rendering)
      SideBySideDiffRows.tsx              (side-by-side rendering)
      hooks/
        useDiffNavigation.ts              (selection, scroll, file/hunk nav, keyboard)
        useDiffComments.ts                (comment store + dialog state)
  shared/utils/diff/
    loadDiff.ts                           (async git invocation + parsing)
    convertToSideBySide.ts                (pure transform)
    formatCommentsAsPrompt.ts             (pure prompt formatter)
    types.ts                              (DiffLine, SideBySideLine, ViewMode, WrapMode)
```

Each extracted module ≤ 250 lines. Orchestrator < 300 lines.

## Acceptance criteria

1. `src/components/views/DiffView.tsx` is < 300 lines.
2. Every extracted module is < 250 lines.
3. The new files exist at the paths listed in **Target file layout**; no other new files are created.
4. `loadDiff`, `convertToSideBySide`, `formatCommentsAsPrompt`, and the diff types are each exported from their own module under `src/shared/utils/diff/`.
5. `DiffView.tsx` no longer re-exports `formatCommentsAsPrompt`; `tests/unit/comment-fileheader-duplicate.test.tsx` is updated to import from `src/shared/utils/diff/formatCommentsAsPrompt.ts`.
6. `tests/unit/sideBySideDiff.test.ts` imports `convertToSideBySide` directly from its new module (no longer reaching into "the internal function from DiffView").
7. New unit tests are added for each extracted pure utility:
   - `loadDiff.test.ts` — covers diff parsing, untracked files, hunk header parsing, line-counter tracking
   - `convertToSideBySide.test.ts` — beyond what `sideBySideDiff.test.ts` already covers, fills gaps for headers, mixed added/removed runs, and orphan added lines
   - `formatCommentsAsPrompt.test.ts` — covers workspace context, base commit hash header, removed-line handling, file-level comments
8. All existing tests pass without modification, **except** the import-path update in (5) and (6).
9. `npm run typecheck` passes.
10. `npm run build` succeeds.
11. Behaviour parity verified manually: open a diff in the running app, exercise unified ↔ side-by-side toggle, wrap toggle, file/hunk navigation (n/p), commenting flow, and "send to session" — all behave identically to pre-refactor.
12. No new dependencies added.

## Edge cases

| Case | Expected |
|---|---|
| Refactor uncovers a latent bug in DiffView | File a separate tracker item; do **not** fix in this PR. Strict refactor. |
| A piece of logic doesn't fit cleanly in any of the proposed modules | Add it to the orchestrator for now and note it in `implementation.md` for follow-up. |
| Extracted hook needs state that the orchestrator also needs | Lift state to the orchestrator; pass into the hook as arguments. Don't duplicate state. |
| Cyclic import between extracted modules | Resolve by lifting shared types into `shared/utils/diff/types.ts`. |
| `formatCommentsAsPrompt` is imported anywhere else (not just the one test) | Update all callers to the new path. Grep before finishing. |

## Constraints

- **Pure refactor** — no behaviour changes, no new features, no opportunistic cleanup outside this file's seams.
- **Single PR** — atomic move; do not ship partial extraction.
- **No new dependencies.**
- **No changes to public types or props of `DiffView`** — `App.tsx` import and Props remain identical.

## Out of scope

- Performance optimisations to diff rendering or scrolling
- Changes to comment storage or `commentStoreManager`
- Changes to `CommentInputDialog`, `SessionWaitingDialog`, `UnsubmittedCommentsDialog`, `FileTreeOverlay` (used by DiffView, not owned by it)
- Adding tests for hooks or rendering subcomponents (only pure utilities get new tests)
- Changes to `loadDiff`'s shell-out approach (e.g. replacing `bash -lc … sed -n` with native fs reads)
