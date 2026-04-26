---
title: "dont show binary file contents in diffview"
slug: hide-binary-diff-content
updated: 2026-04-26
---

## What changed

- Updated `src/shared/utils/diff/loadDiff.ts` so untracked files are classified with Git before previewing contents.
- If Git reports an untracked file as binary, the diff view now renders the file header and a single `Binary file not shown` placeholder row instead of reading file bytes into the terminal.
- Untracked text files keep the existing preview behavior based on `sed -n '1,200p'`.
- Added unit coverage in `tests/unit/loadDiff.test.ts` for both the binary placeholder path and the unchanged text preview path.

## Key decisions

- Used Git's own `diff --no-index --numstat` classification for untracked files so the behavior stays aligned with the existing tracked-file diff path.
- Kept the fallback conservative: if the binary check does not produce a usable result, the file is treated as binary and its contents stay hidden.

## Cleanup notes

- Focused verification passed: `npm test -- tests/unit/loadDiff.test.ts --runInBand`.
- Full repo verification passed for this change: `npm run typecheck` and `npm run build`.

## Stage review

Implemented the diff-loader change without altering the diff view UI model. The only behavior change is that untracked binary files now stay visible in review as file entries but no longer dump their contents into the terminal.
