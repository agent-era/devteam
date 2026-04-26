---
title: "dont show binary file contents in diffview"
slug: hide-binary-diff-content
updated: 2026-04-21
---

## Problem

The diff view currently renders raw contents for untracked files by shelling out to `sed -n '1,200p'` in [src/shared/utils/diff/loadDiff.ts](/home/mserv/projects/devteam-branches/hide-binary-diff-content/src/shared/utils/diff/loadDiff.ts:92). That works for text files, but it also means an untracked binary file can dump unreadable bytes directly into the CLI diff view. The tracked-file path is safer because it relies on `git diff`, which already suppresses binary content.

## Why

Showing binary payloads in the terminal is noisy and not useful for review. It can also break the readability of the diff view, create odd terminal output, and make navigation/commenting worse for a case where the user really just needs to know that a binary file exists and changed.

## Summary

Update diff loading so the diff view never renders raw contents for binary files. The change should focus on untracked-file handling in `loadDiff()`: text files should continue to show a preview, while binary files should appear in the file list and diff body with a clear placeholder message instead of content. The UI structure, navigation model, and comment flow should otherwise stay unchanged.

## Acceptance criteria

1. Opening diff view for a worktree with an untracked binary file does not render the file's raw bytes or decoded payload in the diff body.
2. The diff still includes the binary file as a file entry so the user can see that it exists in the review set.
3. Binary files render a concise placeholder row that makes it clear the content is intentionally hidden.
4. Untracked text files keep the existing behavior of showing preview lines in the diff body.
5. Existing tracked-file diffs continue to render through the current `git diff` path without regressions to normal text diffs.
6. Automated test coverage is added for the binary-file path and proves the hidden-content behavior.

## Edge cases

- An untracked file with no readable text content should still produce a stable placeholder rather than an empty or broken section.
- The binary check should work for nested paths and filenames with spaces or shell-sensitive characters.
- If binary detection fails unexpectedly, the fallback should prefer not showing raw content over dumping unreadable bytes.
- The placeholder row should behave like a normal diff row in unified and side-by-side rendering so navigation remains stable.
