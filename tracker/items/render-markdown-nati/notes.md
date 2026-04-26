---
title: Discovery — render markdown natively
slug: render-markdown-nati
updated: 2026-04-25
---

## Problem

Render markdown natively in the terminal (no external pager) for two surfaces:

1. **Item detail view** — opened by pressing Enter on a kanban card. Show the item's markdown files (`requirements.md`, `notes.md`, `implementation.md`) and let the user flip between them, or scroll through them stacked.
2. **Diff view** — also use the renderer there, presumably so changes to `.md` files are readable as formatted markdown rather than raw source.

## Findings

### Surface 1 — item detail view (`src/screens/TrackerItemScreen.tsx`)

- Today the screen shows: stage description, exit criteria, checklist, **a short raw‑text preview of `requirements.md`**, and signals (whether `notes.md` / `implementation.md` exist on disk). Preview comes from `TrackerService.readRequirementsPreview(item)` (`TrackerService.ts`, called at `TrackerItemScreen.tsx:118`).
- `notes.md` and `implementation.md` are detected but **never displayed**. Only flags (`hasNotes`, `hasImplementationNotes`) reach the screen.
- Scrolling: a single `scrollTop` over the assembled `contentLines[]`, ↑/↓ adjusts by 1 (`TrackerItemScreen.tsx:154–157`). No paging, no doc switcher.
- Item file paths are already on the `TrackerItem` (`TrackerService.ts:236–254`): `requirementsPath`, `notesPath`, `implementationPath`. So the renderer has the inputs it needs without new I/O plumbing.
- Layout primitives we should reuse: `useTerminalDimensions`, `LineWrapper.wrapLine` / `calculateHeight`, `stringDisplayWidth` / `truncateDisplay` / `fitDisplay` in `shared/utils/formatting.ts`. These are already wide‑char‑aware; a markdown renderer must use them, not `string.length`.

### Surface 2 — diff view (`src/components/views/DiffView.tsx`)

- Diff is line‑based. Each line is colored as added/removed/context. For code, individual line text is run through `ink-syntax-highlight` inside `UnifiedDiffRows.tsx` / `SideBySideDiffRows.tsx` (per‑line, via `getLanguageFromFileName`).
- For `.md`, "syntax highlighting" today colors `#`, `*`, backticks etc. as if they were source — which is exactly what the user wants to replace.
- **Open question for requirements:** what does "use the renderer in the diffview" mean concretely? Two readings:
  - **(A) Inline per‑line styling** — when a diff line is from a `.md` file, render that line's markdown inline (bold, italic, code‑span styling) instead of running `ink-syntax-highlight`. Block constructs (headings, lists, code fences) only get partial fidelity because the diff splits them across +/− lines. This is the natural drop‑in.
  - **(B) Rendered preview pane** — show a fully‑rendered version of the new file alongside or instead of the diff for `.md` files. Bigger UX change; loses +/− information.
  - I'll recommend (A) and flag (B) as a follow‑up. Final call belongs in requirements.

### Surface 3 — markdown library

- No markdown library is installed (`package.json` has only `ink`, `@inkjs/ui`, `ink-syntax-highlight`, `react`).
- The codebase uses ESM + Ink `<Text>` + custom width‑aware wrapping. A renderer needs to emit Ink `<Text>` spans (so styling composes), not ANSI strings.
- Realistic options:
  - **`marked` + custom Ink renderer** — `marked` parses to tokens; we walk tokens and emit `<Text>` nodes. Full control over wrapping, width, themes. Modest amount of code (a few hundred lines), but it's the right shape for this codebase. **Recommended.**
  - **`marked-terminal`** — emits ANSI strings. Fights with our `<Text>`‑composition + width utils; ANSI in nested `<Text>` is fragile in Ink. Not recommended.
  - **Hand‑rolled mini parser** — tempting for "we only need headings/bold/italic/code/lists" but corner cases (nested emphasis, tables, fenced code, links) are exactly where users notice. Use a real parser.
- Memory note: the user's terminal client renders plain markdown but **strips ANSI** in some contexts. That doesn't apply here (Ink writes to the live TTY, not the chat client), but it reinforces the "emit `<Text>` spans, not ANSI" choice.

### Surface 4 — what doesn't exist yet

- **No tab / segmented‑nav component** for switching between documents (requirements / notes / implementation). Will need a small one.
- **No content‑height‑aware scroll component** for arbitrary line arrays beyond what `DiffView` already does. The diff has its own viewport math (`ViewportCalculator`, `LineWrapper.calculateHeight`). For the markdown viewer the simplest approach is a flat list of rendered "row" elements (each row = one wrapped visual line) and reuse the same `scrollTop` / viewport pattern from `TrackerItemScreen`.
- The detail screen's keyboard shortcut footer is hard‑coded; we'll extend it for `[1/2/3]` or `tab` to switch docs and `pgup/pgdn` for fast scroll.

## Recommendation

1. Add `marked` as a dep. Build a small `MarkdownView` component under `src/components/views/markdown/` that:
   - parses tokens with `marked.lexer`
   - renders each token to one or more "visual rows" (`{ key, spans: { text, bold?, italic?, color?, dim?, indent? }[] }`)
   - returns a list of rows the host screen can slice for its viewport, reusing the `TrackerItemScreen` scroll pattern.
2. Wire `MarkdownView` into `TrackerItemScreen`:
   - replace the "Requirements Preview" block with a docs region.
   - add a tab strip for available docs (only show tabs for files that exist).
   - keys: `[tab]` / `[1]/[2]/[3]` switch doc, `↑/↓` scroll one row, `pgup/pgdn` scroll a page, `g/G` to top/bottom.
3. Wire markdown line styling into the diff view (Approach A above): when `getLanguageFromFileName` returns markdown, route the per‑line text through an inline‑markdown renderer (subset: emphasis, code spans, headings detected by leading `#`) instead of `ink-syntax-highlight`. Keep the diff frame, gutter, and +/− coloring untouched.
4. Tests: unit tests on the token‑to‑rows function (deterministic strings); a small e2e on `TrackerItemScreen` switching docs.

Risks: width‑aware wrapping of styled spans is the most error‑prone part — must use `stringDisplayWidth`, not raw length. `marked` v12+ ESM; verify it imports cleanly with our `tsc` config.

## What needs the user's call (belongs in requirements)

- Diff view scope: Approach A (inline styling) vs Approach B (rendered preview pane) vs both.
- Doc switcher behaviour: tabbed (one doc visible) vs stacked (all docs concatenated, scrollable).
- Whether `status.json` should be readable from this view too (nice‑to‑have given it's already in the item dir).
