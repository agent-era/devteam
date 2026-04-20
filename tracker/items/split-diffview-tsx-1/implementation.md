---
title: Split DiffView.tsx (1302 lines) into focused subcomponents — Implementation
slug: split-diffview-tsx-1
updated: 2026-04-20
---

## What was built

Split `src/components/views/DiffView.tsx` from 1302 lines into a focused orchestrator plus seven extracted modules. Pure refactor — no behaviour change.

### Files created

| Path | Lines | Purpose |
|---|---:|---|
| `src/shared/utils/diff/types.ts` | 33 | `DiffLine`, `SideBySideLine`, `ViewMode`, `WrapMode`, `DiffType` |
| `src/shared/utils/diff/loadDiff.ts` | 103 | async git invocation + `parseUnifiedDiff` pure helper |
| `src/shared/utils/diff/convertToSideBySide.ts` | 65 | pure unified→side-by-side transform |
| `src/shared/utils/diff/formatCommentsAsPrompt.ts` | 45 | pure prompt formatter + `formatCommentsAsLines` |
| `src/components/views/diff/UnifiedDiffRows.tsx` | 103 | unified-mode row rendering |
| `src/components/views/diff/SideBySideDiffRows.tsx` | 123 | side-by-side row rendering |
| `src/components/views/diff/hooks/useDiffNavigation.ts` | 224 | selection, scroll animation, file/hunk nav, keyboard |
| `src/components/views/diff/hooks/useDiffComments.ts` | 242 | comment store, dialog state, send-to-tmux pipeline |

### Orchestrator

`src/components/views/DiffView.tsx` is now **285 lines** (< 300 target). Props unchanged; `App.tsx` import path unchanged.

## Key decisions

1. **Callbacks ref pattern**. `useDiffNavigation` owns the `useInput` keyboard handler but needs to call handlers that live in `useDiffComments`. Because hooks must be called in a fixed order, the orchestrator passes a `callbacksRef` into the nav hook and populates it with the latest comment handlers after both hooks run. The `useInput` closure reads `callbacksRef.current` at keypress time, so it always sees the latest.

2. **`viewportRowsRef`**. Nav's page-up/page-down keyboard shortcut uses viewportRows, but viewportRows depends on state computed after the nav hook runs. Passing a ref avoids stale values without creating a circular hook dependency.

3. **Deduped prompt formatting**. Extracted `formatCommentsAsLines(comments, opts): string[]` so both the string prompt (for initial `claude "..."` invocation) and the Alt+Enter multiline send (for running sessions) share a single source of truth. `formatCommentsAsPrompt` is now `formatCommentsAsLines(...).join('\n') + '\n'`.

4. **Unified `getCommentTarget` helper**. Original `handleCommentSave` / `deleteCurrentComment` / comment-dialog-open each branched on viewMode with duplicated logic. Extracted a single `getCommentTarget(params)` that resolves `{fileName, lineText, perFileIndex, isFileLevel, isRemoved, originalLineIndex, isHunkHeader}` for either mode.

5. **Preserved empty-text guard**. The original `handleCommentSave` had an `if (currentLine && fileName && lineText)` guard only on the side-by-side path. Kept this as `params.viewMode === 'sidebyside' && !target?.lineText` to avoid any behaviour drift.

6. **`headerTypeAt` helper in navigation**. Three separate `isChunkHeader` / `isFileHeader` / `findFirstContentLineAfterHeader` helpers collapsed into one `headerTypeAt(...) : 'file' | 'hunk' | null` plus the content-line finder — shorter and clearer.

## Tests

### Updated
- `tests/unit/comment-fileheader-duplicate.test.tsx` — now imports `formatCommentsAsPrompt` from its new module.
- `tests/unit/sideBySideDiff.test.ts` — imports `convertToSideBySide` directly (deleted the inlined copy-paste that used to live in the test).

### Added
- `tests/unit/loadDiff.test.ts` — 6 tests covering `parseUnifiedDiff`: empty input, file + hunk headers, line-counter tracking from hunk header, +/- markers vs +++/---, multi-file split, blank lines preserved as single-space context.
- `tests/unit/convertToSideBySide.test.ts` — 6 tests covering header types propagated to both sides, line-index copy, mixed removed/added runs separated by context, orphan added at start, uneven added runs, increasing `lineIndex`.
- `tests/unit/formatCommentsAsPrompt.test.ts` — 7 tests covering intro + trailing blank, workspace context line, base-hash suffix, removed line with/without original number, file-level comment header-only, grouping by file, and `formatCommentsAsLines` parity with `formatCommentsAsPrompt`.

## Verification

- `npx tsc --noEmit -p tsconfig.test.json` — clean.
- `npm run build` — succeeds.
- `npx jest` — **500 tests passed across 63 test suites** (existing 480 + 20 new).

## Notes for cleanup

- `getLanguageFromFileName` is still called every render through `languageCache` in the orchestrator; the memoized Map cache is reset only on component mount. If later profiling shows diff file-name hashing is hot, consider hoisting the cache.
- The `sleep` call in `sendCommentsToTmux` (for the race-condition verification) is a pre-existing pattern preserved as-is — not touched by this refactor.
- The requirements AC #3 forbids adding files beyond the listed layout; I stayed within that. If cleanup wants to pull `getCommentTarget` or the header helpers out into their own small modules, that would need a separate item.
