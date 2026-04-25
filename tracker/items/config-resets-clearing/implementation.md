# Implementation: config-resets-clearing

## What was built

Prompt + UI fix (no merge logic in code) — safety now lives in two places.

1. **Hardened `SETTINGS_EDIT_CLAUDE_PROMPT`** in `src/constants.ts`. The old
   "Preserve any fields you don't need to change" softness is replaced with
   four numbered HARD RULES: the output must include every top-level and
   nested key from the current config, unchanged fields must be echoed
   byte-for-byte, omitting any field is a failure. This is the primary
   defence against Claude dropping sections like `aiToolSettings` when
   answering a narrow edit.

2. **DiffView now distinguishes added / changed / removed** in
   `src/components/dialogs/SettingsDialog.tsx`. New helpers
   `classifyChange()` and `kindPrefix()`; removals render as a bold red
   `REMOVED` in the after column (previously `(missing)`, which read like
   "unchanged placeholder"), prefixed with `- ` on the key, and sorted to
   the top of the diff so they can't hide in a long list. A bold red
   header banner appears when any removals are present. Additions render
   with `(not set)` on the before side for clarity.

3. **Empty-Enter = regenerate trap removed.** `handleSubmit` now treats an
   empty trimmed prompt as a no-op. The input helper text no longer
   advertises "empty = regenerate".

4. **Explicit regenerate keybind with confirmation.** New `R` keybind
   opens a red inline confirm ("Discard current config and regenerate
   from scratch?") that explains what will be discarded. `y`/`Y`
   triggers `onGenerate()`; any other key cancels. Hint bar updated to
   advertise `[R] regenerate from scratch`.

5. **Tests** in `tests/unit/settingsDialog-wipe-prevention.test.tsx`:
   classifyChange edge cases (including "explicit empty array ≠
   removed"), handleSubmit empty-Enter no-op, regenerate keybind flow
   (R→confirm→y triggers, any-other-key cancels), ignored while loading.

## Key decisions

- **Chose prompt + UI over server-side merge** at user's request. Rationale
  saved to `~/.claude/.../feedback_prompt_over_merge.md`. Apply stays a
  full replace; the schema and prompt are the guardrail, the diff is the
  safety net.
- **Honoured "empty = clear"** semantics: an explicit `flags: []` from
  Claude classifies as `changed` (not `removed`), so the user can still
  deliberately clear a field via an edit prompt. Only **absence** of a
  key triggers the `removed` signal.
- **Exported `classifyChange` and a `DIFF_MISSING` alias** so tests can
  verify the decision table without rendering Ink. Kept the `MISSING`
  symbol private by re-exporting under a neutral name.
- **Put removed rows at the top of the diff** so a Claude output that
  drops a section is the first thing the user sees, even if many other
  rows changed.

## Notes for cleanup

- The `RUN_CONFIG_CLAUDE_PROMPT` (regenerate-from-scratch) was left
  untouched. It deliberately does not receive the current config, so the
  "include every existing field" rule doesn't apply to it — the
  confirmation dialog is the safety net there.
- `applyConfig` was intentionally not modified; this keeps the write
  path a single wholesale `writeRunConfig` call, which is easy to reason
  about. The existing `applyConfig.test.ts` still covers it.
- No test had to be updated — existing 686 tests all pass. New test
  file adds 16 cases.
- Worktree-local stale `.devteam/config.json` files (with old
  `detachOnExit` key) are still on disk in some worktrees. They're
  unread by the code but are cosmetic clutter; out of scope here per
  requirements.

## Stage review

Delivered the prompt + UI approach end-to-end: hardened the edit prompt,
rebuilt the diff classification (added / changed / removed with explicit
`REMOVED` styling and top-of-diff ordering), removed the empty-Enter
regenerate trap, and gated regenerate behind `R` + confirm. All 686
existing tests still pass; 16 new cases in
`settingsDialog-wipe-prevention.test.tsx` lock in the behaviour.
