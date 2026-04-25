---
title: "render markdown natively in the terminal, formatted for native terminal view. use it in the item detail view (pressing enter on an item from kanban). show the tracker item's markdown files and let the user flip between them, the different stages ones (or just show them scrolling up/down). also put this renderer in the diffview"
slug: render-markdown-nati
updated: 2026-04-25
---

## Problem

Render markdown natively in the terminal (no external pager) for two surfaces:

1. **Item detail view** — opened by pressing Enter on a kanban card. Show the item's markdown files (`requirements.md`, `notes.md`, `implementation.md`) and let the user flip between them, or scroll through them stacked.
2. **Diff view** — also use the renderer there, so changes to `.md` files are readable as formatted markdown rather than raw source.

## Why

Tracker items already centre on markdown — `requirements.md`, `notes.md`, `implementation.md` are where the real content lives — but today the kanban detail screen only shows a raw‑text preview of `requirements.md` and never surfaces `notes.md` or `implementation.md` at all. The diff view styles `.md` as if it were source code via `ink-syntax-highlight`, which colors `#`, `*`, backticks, etc. instead of reading like a document. Both surfaces force the user to leave the tool to actually read what's there. Rendering markdown in‑place keeps the review flow inside the app and makes the docs first‑class rather than incidental.

## Summary

Add a width‑aware, native Ink markdown renderer (CommonMark core) that emits styled `<Text>` spans — no ANSI strings — and wire it into two places. In the item detail view, replace the requirements preview with a stacked, scrollable region that concatenates `requirements.md`, `notes.md`, and `implementation.md` (in that order, only files that exist) with section separators, plus `[1]/[2]/[3]` quick‑jump to each doc's start. In the diff view, render `.md` diff lines through the markdown renderer instead of `ink-syntax-highlight`; because each diff line lacks block context, the diff view first runs a **pre‑rendering pass over the file's post‑image** to record per‑line block state (inside fenced code, list nesting, heading, blockquote, etc.), and per‑line styling consults that map. The +/− gutter, line numbers, and per‑line add/remove coloring are preserved. Renderer uses the existing width utilities (`stringDisplayWidth`, `LineWrapper`) for wrapping. Library: `marked` for tokenisation; the row emitter and Ink integration are written in this repo.

## Acceptance criteria

1. **Renderer module** parses CommonMark‑core: ATX headings (h1–h6), bold (`**`/`__`), italic (`*`/`_`), inline code (backticks), fenced code blocks (```` ``` ````), unordered + ordered + nested lists (≥ 2 levels), blockquotes, horizontal rules, and links (rendered as styled text followed by a dim URL). It does **not** need to handle GFM extensions (tables, task lists, strikethrough) for this PR.
2. **Width awareness:** given a target column width, the renderer produces an array of "visual rows" (each row a list of styled spans) where no row exceeds the width when measured with `stringDisplayWidth` (handles wide chars and emoji). Rows are derived from token output, never from naive string slicing.
3. **No ANSI strings.** Styling is expressed as Ink `<Text>` props (`bold`, `italic`, `dimColor`, `color`, `inverse`) on nested `<Text>` children — composes with the rest of the codebase's components.
4. **`MarkdownView` component** accepts `{markdown: string, width: number, height: number, scrollTop: number}` and renders only the visible window. Empty/whitespace‑only input renders a single dim `(empty)` row instead of crashing.
5. **Item detail screen** (`TrackerItemScreen.tsx`) replaces the "Requirements Preview" block with a stacked markdown region. The region concatenates, in order, the docs that exist on disk among `requirements.md`, `notes.md`, `implementation.md`, with a one‑line dim header (e.g. `── notes.md ──`) before each. If none exist, show `(no markdown yet)`.
6. **Detail‑screen keys:** `↑`/`↓` scroll one visual row; `PgUp`/`PgDn` scroll one viewport; `g`/`G` jump to top/bottom of the stacked region; `[1]` / `[2]` / `[3]` jump scroll position to the start of `requirements.md` / `notes.md` / `implementation.md` respectively (no‑op if that file doesn't exist). Existing `[h]/[l]` action selection, `[enter]`, and `[esc]/[q]` continue to work; the footer hint is updated.
7. **Diff‑view block‑context pre‑pass:** when the diff contains a `.md` file, run a single‑pass scan over the file's **post‑image** (the new full contents) to produce a `Map<lineNumber, BlockContext>` where `BlockContext` records at minimum: `inFencedCode` (bool, with the fence's info string when known), `listIndent` (number), `inBlockquote` (bool), and `isHeading` (level or null). For deleted files, scan the pre‑image instead. Computed once per file, cached on diff load.
8. **Per‑line render in diff:** for each `.md` diff line, look up its block context by post‑image line number and route to the inline markdown renderer with that context. Inside a fenced code block, the line renders as plain monospace text (no inline markdown parsing). Outside a fence, the line is parsed for inline emphasis / code spans / link text and styled accordingly. Headings get heading styling on the heading line itself.
9. **Diff‑view non‑regressions:** for non‑`.md` files the diff view continues to use `ink-syntax-highlight` as today. The `+`/`−`/context gutter, line numbers, file/hunk headers, comment markers, and selected‑row highlighting render unchanged for `.md` files. Side‑by‑side and unified modes both work.
10. **Tests.** Jest unit tests cover (a) the token‑to‑rows function for each supported block type and inline construct, including width wrapping; (b) the diff block‑context pre‑pass — fenced code spans across multiple lines, heading lines, list ranges. One e2e test in `tests/e2e/` opens an item from the kanban, asserts that all three docs render, and verifies that `[1]/[2]/[3]` move the visible viewport. Type checking passes (`npm run typecheck`).
11. **Dependency:** `marked` (latest v12+, ESM) added to `dependencies` in `package.json`. No `marked-terminal` (it emits ANSI which fights the `<Text>`‑composition model).
12. **Out of scope for this PR** (call out and skip): rendering `status.json`, image rendering, clickable terminal hyperlinks (OSC 8), syntax highlighting *inside* fenced code blocks, GFM tables / task lists / strikethrough, search‑in‑doc.
