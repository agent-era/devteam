---
title: "config seems to keep getting cleared. the run config (and flags for agents)"
slug: config-resets-clearing
updated: 2026-04-22
---

## Problem

The project config at `{project}/.devteam/config.json` — specifically the
`executionInstructions` block (run config: `mainCommand`, `preRunCommands`,
`environmentVariables`, `keepShellRunning`) and `aiToolSettings.<tool>.flags`
(e.g. `--dangerously-skip-permissions`, `--full-auto`, `--yolo`) — resets
itself back to defaults/empty after the user has set real values.

## Why

Two silent-wipe paths in the SettingsDialog AI flow are the only writers of
this file, and both can replace user-set values with schema defaults:

1. In `src/components/dialogs/SettingsDialog.tsx`, pressing Enter on an empty
   prompt calls `onGenerate()` → `RUN_CONFIG_CLAUDE_PROMPT`, which never
   receives the current config and regenerates from schema examples
   (`flags: []`, `environmentVariables: {}`).
2. The edit prompt (`SETTINGS_EDIT_CLAUDE_PROMPT`) asks Claude to "preserve
   any fields you don't need to change" — a soft instruction. Claude
   routinely drops whole sections like `aiToolSettings` when answering a
   narrow edit. `WorktreeCore.applyConfig` then wholesale-replaces the file,
   losing those sections.

The diff preview shows removed fields as `value → (missing)`, which reads
more like "unchanged placeholder" than "being deleted", so users
`a`-apply without noticing.

Impact: losing `executionInstructions.mainCommand` makes the run session
(`[x]` exec) fall through to its no-config branch; losing
`aiToolSettings.<tool>.flags` means agents relaunch without
`--dangerously-skip-permissions` / `--full-auto` / `--yolo`, forcing the
user to re-accept every permission prompt and defeating the point of
setting flags in the first place.

## Summary

Fix this with the prompt and the diff UI — no merge logic in code. Rewrite
`SETTINGS_EDIT_CLAUDE_PROMPT` so Claude is required to emit the **complete**
config (echo every existing field unchanged unless the user asks to change
it). Make the diff preview loudly distinguish **removed** fields from the
ambiguous "(missing)" placeholder, so a Claude output that drops a section
is impossible to miss at apply time. Remove the "empty Enter =
regenerate from scratch" surprise so regeneration is always an explicit,
confirmed action. Apply remains a wholesale replace — the safety lives in
the prompt and in the review step.

## Acceptance criteria

1. `SETTINGS_EDIT_CLAUDE_PROMPT` is tightened so Claude must emit every
   field present in the current config — both keys the user is changing
   and keys they are leaving alone — echoed verbatim for unchanged fields.
   Language is imperative and uses hard wording ("MUST include every
   top-level and nested field from the current config", "omitting any
   existing field is a failure") rather than the current soft "preserve
   any fields you don't need to change".
2. The diff view in `SettingsDialog` distinguishes three change types:
   **added** (absent before, present after), **changed** (different
   values), and **removed** (present before, absent after). Removed rows
   render with a clear "removed" marker and red styling on the "after"
   side (e.g. shown as `removed` rather than `(missing)`). The existing
   "(missing)" placeholder remains only for the compact table view where
   a field was absent both before and after.
3. In `SettingsDialog`, pressing Enter in the prompt input with an empty
   string is a no-op (no AI call, no diff preview). The helper text under
   the input no longer advertises "empty = regenerate".
4. Regenerate-from-scratch is reachable only via an explicit key binding
   (e.g. `R`) shown in the dialog's hint bar, and it first requires a
   yes/no confirmation naming what will be discarded
   (e.g. "Discard current config and regenerate from scratch? (y/N)").
   Confirming runs `RUN_CONFIG_CLAUDE_PROMPT`; declining returns to the
   dialog with no changes.
5. `WorktreeCore.applyConfig` continues to do a wholesale replace of the
   on-disk file. No merge logic is introduced in this item.
6. Existing unit/E2E tests pass. New test coverage: (a) the diff view
   renders a removed field with the "removed" marker (not "(missing)");
   (b) pressing Enter on an empty SettingsDialog prompt makes no
   `generateConfigWithAI` or `editConfigWithAI` call; (c) the regenerate
   keybind requires confirmation before calling `generateConfigWithAI`.

## Out of scope

- Adding merge/patch logic to `applyConfig`. Apply stays a full replace;
  safety lives in the prompt and the diff UI.
- Moving `.devteam/config.json` into version control or per-worktree
  storage.
- Cleaning up stale worktree-local `.devteam/config.json` files that
  predate the schema rename (they are unread by the code).
