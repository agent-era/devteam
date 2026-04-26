---
title: "dont show binary file contents in diffview"
slug: hide-binary-diff-content
updated: 2026-04-21
---

## Problem

The diff view currently renders raw contents for untracked files by shelling out to `sed -n '1,200p'` in [src/shared/utils/diff/loadDiff.ts](/home/mserv/projects/devteam-branches/hide-binary-diff-content/src/shared/utils/diff/loadDiff.ts:92). That works for text files, but it also means an untracked binary file can dump unreadable bytes directly into the CLI diff view. The tracked-file path is safer because it relies on `git diff`, which already suppresses binary content.

## Why

Showing binary payloads in the terminal is noisy and not useful for review. It can also break the readability of the diff view, create odd terminal output, and make navigation/commenting worse for a case where the user really just needs to know that a binary file exists and changed.

## Findings

- The bug is isolated to the untracked-file branch in `loadDiff()`.
- Tracked diffs already go through `git diff --no-color --no-ext-diff`, so they inherit Git's binary handling and do not need a broader redesign.
- The smallest fix is to detect whether an untracked file is text before reading it. If it is binary, render only a file header plus a short placeholder row instead of file contents.
- The most practical detection path is to let Git classify the file from the worktree, rather than maintaining our own extension-based allowlist.

## Recommendation

Keep the existing diff model and UI. Change untracked-file loading so `loadDiff()` asks Git whether each untracked file is text or binary before attempting to read it. For binary files, add a single synthetic row such as `Binary file not shown` under the file header; for text files, preserve the current preview behavior. Add a focused unit test for `loadDiff()` and one diff-view rendering test that proves binary content is hidden.
