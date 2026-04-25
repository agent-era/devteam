---
title: Implementation — render markdown natively
slug: render-markdown-nati
updated: 2026-04-25
---

## What was built

Native markdown rendering in the terminal, wired into two surfaces:

1. **Item detail view** (`src/screens/TrackerItemScreen.tsx`) — markdown-first layout: chrome collapsed to one dim status line; the rest of the screen is a stacked markdown viewer over `requirements.md`, `notes.md`, and `implementation.md` (only those that exist). `[1]/[2]/[3]` jump to each doc; `↑/↓`, `PgUp/PgDn`, `g/G` scroll; existing `[h]/[l]` action selection and `[esc]/[q]` back unchanged.
2. **Diff view** (`src/components/views/DiffView.tsx` + `diff/UnifiedDiffRows.tsx` + `diff/SideBySideDiffRows.tsx`) — for `.md` files, each diff line is rendered through the markdown styler. A pre-rendering pass scans the post-image (and pre-image, for removed lines) of every `.md` file in the diff once, building a `Map<lineNumber → BlockContext>`; per-line styling consults that map so e.g. a line inside a fenced code block renders verbatim instead of being interpreted as markdown. The `+/−` gutter, line numbers, comment markers, and add/remove tinting are preserved. Non-`.md` files keep `ink-syntax-highlight` as before.

## Key files

- `src/shared/utils/markdown/types.ts` — `Span`, `MdRow`, `BlockContext` (discriminated union).
- `src/shared/utils/markdown/blockContext.ts` — `computeBlockContext(content)` line scanner: 1-indexed `BlockContext[]` per source line. Tracks fenced code (back-tick and tilde), headings, lists with indent, blockquotes, HRs, blanks.
- `src/shared/utils/markdown/inline.ts` — uses `marked`'s `Lexer.inlineTokens` to walk inline tokens (`strong`, `em`, `codespan`, `link`, `del`, …) into styled `Span[]`.
- `src/shared/utils/markdown/render.ts` — `lineToParts(line, ctx)` decomposes a line into leading prefix / body spans / continuation prefix; `wrapSpans(...)` is width-aware (uses `stringDisplayWidth`) and preserves per-span styles across wrapped rows; `renderLine` and `renderMarkdown` compose those for full-doc usage.
- `src/shared/utils/markdown/diffPrepass.ts` — `buildMdContextMap(worktreePath, lines, baseHash)` (post via working-copy read, pre via `git show {base}:{file}`); `lookupBlockContext(line, side, map)` returns the right side's context based on `oldLineIndex` / `newLineIndex`.
- `src/components/views/markdown/MarkdownView.tsx` (+ `MarkdownRowView.tsx`) — viewport over a flat `MdRow[]` slice, no internal scroll state.

## Key decisions

- **Hand-rolled block scanner, marked for inline only.** The block lexer in `marked` collapses content (e.g. heading text without the `#` marks) and the diff view needs exact line numbers, so a small line-by-line regex scanner is a better fit. `marked.Lexer.inlineTokens` does inline parsing well — no reason to hand-roll it.
- **Span-based output, never ANSI strings.** Spans become Ink `<Text>` props (`bold`, `italic`, `dimColor`, `color`). This composes with the rest of the codebase's components (e.g. row backgrounds, inverse for selected rows) instead of fighting them. `marked-terminal` was rejected for this reason.
- **Width-aware wrapping with `stringDisplayWidth`.** Naïve `string.length` would break on wide CJK chars and emoji. `wrapSpans` walks chars, accumulates display width, and breaks when it would exceed; leading/continuation prefixes are reapplied so list bullets / blockquote bars persist on wrapped rows.
- **Diff: pre-rendering pass at load time.** When a diff loads, each unique `.md` file's pre + post images are read once and scanned. The map lives at `DiffView` level and is passed down. This is the user-requested architecture — per-line rendering needs cross-line context (most importantly: are we inside a fenced code block?), and the pass is the cleanest way to provide it without reparsing on every render.
- **Markdown-first detail layout.** Per design call: chrome is one dim line (`Discovery  •  ✓ Ready to advance` / `…  •  ✗ N criteria pending`), markdown owns the rest. Section headers (`── notes.md ──`) separate stacked docs.
- **Default text dimming for visual hierarchy.** Plain (unstyled) inline spans are dimmed so headings (bright `*Bright` colours), bold, links, and code stand out against them. Code (fenced + inline) uses `yellow + dim` — distinctive but not louder than the surrounding body.

## Testing

- Unit: `tests/unit/markdown-blockContext.test.ts`, `markdown-render.test.ts`, `markdown-diffPrepass.test.ts` (25 tests). Cover fenced code spans, headings, lists, blockquotes, HRs; inline bold/italic/code/link; width-aware wrapping; lookup logic for added vs removed lines; non-`.md` passthrough.
- Full suite: 513/513 unit tests pass, 191/191 e2e tests pass, `tsc` clean, `npm run build` clean.

## Cleanup hand-off notes

- `jest.unit.config.js` was extended: `marked` added to `transformIgnorePatterns` and a `babel-jest` transform added for `.js` files so the ESM-only `marked` package can run under Jest. Existing `ts-jest` transform for `.ts/.tsx` is unchanged.
- New dep: `marked@18.0.2` in `dependencies`.
- A scratch file was created at `/home/mserv/projects/devteam-markdown-inline-fix.js` (outside the repo, sandbox-blocked from removal) — safe to `rm` if you notice it.
- Out of scope (called out in requirements.md, untouched): syntax highlighting *inside* code fences, GFM tables / task lists / strikethrough, OSC 8 hyperlinks, image rendering, status.json view, search-in-doc.

## Stage review

Built renderer + viewer + diff wiring + tests in one pass. Two style tweaks landed in response to mid-implementation feedback: bright (`*Bright`) heading colours and `yellow + dim` for code (so it sits visually with the dim body text rather than competing). Existing `buildActions` export and its test are unchanged; legacy `buildContentLines` was removed since the screen no longer assembles a content-line list.

## Cleanup-stage additions (post-implement-advance)

- **6 markdown themes** (`src/shared/utils/markdown/themes.ts`) with sharply different palettes: `bright`, `forest`, `sunset`, `ocean`, `neon`, `mono`. Hex colours used where chalk's named palette ran out (forest/sunset/ocean/neon). `[t]` cycles between them in both the tracker detail screen and the diff view; theme is held in module state with a subscribe/notify pattern, surfaced via the new `useMarkdownTheme` hook.
- **Tab-based detail screen UX** (`src/screens/TrackerItemScreen.tsx`):
  - Tab strip across the top, one tab per stage that has a canonical .md file (Discovery → notes.md, Requirements → requirements.md, Implement → implementation.md). Tabs that have content are styled "ready"; the first stage *without* a file is enabled and shows a "the agent hasn't done this stage yet — press [enter]" prompt; later stages without files are dimmed/disabled.
  - Any *other* `.md` files in the item dir are appended as italic-styled "extra" tabs after the canonical stages, with a distinct dim divider banner and `tabExtraColor` accent.
  - `←/→` moves between enabled tabs (skips disabled). `↑/↓ PgUp/PgDn g/G` scroll within the active tab (per-tab scroll position is preserved). `[t]` cycles theme. `[a]` attaches session, `[enter]` runs the primary stage action.
  - The actions row is gone — keys are surfaced in the footer instead. `buildActions` stays exported (used by an existing test) and still drives footer label + warn state.
- The renderer now reads its colour palette through the active theme: heading colours, code colour/dim, link colour, bullet/blockquote bar colours, and divider colour are all theme-driven, with the prior hard-coded values replaced.
