# Discovery: config keeps getting cleared (run config + agent flags)

## Problem

The project config at `{project}/.devteam/config.json` — specifically the
`executionInstructions` block (run config: `mainCommand`, `preRunCommands`,
`environmentVariables`, `keepShellRunning`) and `aiToolSettings.<tool>.flags`
(e.g. `--dangerously-skip-permissions`, `--full-auto`, `--yolo`) — resets itself
back to defaults/empty after the user has set real values.

## Findings

### Where the config lives & how it's written

- Path: `{projectsDir}/{projectName}/.devteam/config.json` (main project root,
  not per-worktree). `src/constants.ts:34` defines `RUN_CONFIG_FILE`.
- File is gitignored (`.gitignore` line `.devteam`) so it never moves with a
  branch checkout.
- **Readers** (`src/cores/WorktreeCore.ts`):
  - `attachRunSession` (line 438) — executes `mainCommand` / `preRunCommands`.
  - `getAIToolFlags` (line 575) — appends flags when launching claude/codex/gemini.
  - `setupWorktreeEnvironment` (line 545) — reads `worktreeSetup` on worktree
    creation. Never writes.
- **Writer**: only `WorktreeCore.applyConfig` → `GitService.writeRunConfig`
  (line 492), which does a full `fs.writeFileSync` — wholesale replace, no
  merge. The only caller is `App.tsx:367` (the "apply" action in SettingsDialog).

So the file is only rewritten by the SettingsDialog AI flow. That flow is the
single point of failure.

### The SettingsDialog AI flow — two ways to silently wipe fields

The dialog (`src/components/dialogs/SettingsDialog.tsx`) calls Claude via two
prompts in `src/constants.ts`:

1. **`RUN_CONFIG_CLAUDE_PROMPT` (regenerate)** — does **not** pass the current
   config. Claude is told to "generate a `.devteam/config.json` that matches
   EXACTLY this schema" and to use the illustrative values when unsure. The
   schema examples are deliberately empty (`flags: []`,
   `environmentVariables: {}`). Regenerating always wipes flags and
   environment variables even if the user had set them.

2. **`SETTINGS_EDIT_CLAUDE_PROMPT` (edit)** — passes `{CURRENT_CONFIG}` and
   asks Claude to "Output the complete updated JSON config. Preserve any
   fields you don't need to change." This is a **soft** preservation rule;
   Claude frequently drops sections (especially unfamiliar ones like
   `aiToolSettings`) when answering a narrow prompt like "add npm install to
   pre-run". The wholesale `writeRunConfig` then loses them.

### The regenerate trap — empty Enter silently wipes the config

`SettingsDialog.handleSubmit`:

```ts
if (trimmed.length === 0) onGenerate();
else onEdit(trimmed);
```

Pressing Enter in the input with nothing typed calls **regenerate**, not
"submit nothing". The helper text under the input says
`[enter] send prompt (empty = regenerate)` — easy to miss. A user who hits
Enter expecting to send an empty-ish confirmation, or who clears and retypes,
ends up triggering the full-scratch regeneration.

The diff view shown before apply only lists **changed** fields. When
everything changes (regenerate), the diff is long and the user is likely to
press `a` without auditing every row. There's also no special styling for
"field removed" — the transition shows as `["--dangerously-skip-permissions"]
→ (missing)`, which reads more like "unchanged placeholder" than "being
deleted".

### Secondary observation — stale orphan config in this worktree

`/home/mserv/projects/devteam-branches/config-resets-clearing/.devteam/config.json`
still contains the pre-rename `detachOnExit` key (renamed to
`keepShellRunning` in commit `6b4b105`) and a non-schema `notes` field. The
app doesn't read from worktree paths for config (it always reads from the
main project), so this file is dormant — but it's evidence that old
snapshots linger on disk under `.devteam/` and can confuse anyone inspecting
what's going on.

## Recommendation

Two small, complementary changes fix the core issue without redesigning the
AI flow:

1. **Never regenerate from scratch by default.** Change the edit path so
   Claude always receives the current config, and drop "empty Enter =
   regenerate" from `handleSubmit`. Keep regenerate available behind an
   explicit key (e.g. `R` with a confirmation "This will discard your
   current config — continue?"). This removes the main surprise.

2. **Treat Claude's output as a patch, not a replacement.** In
   `applyConfig`, shallow-merge the returned JSON on top of the existing
   config per top-level section (`executionInstructions`, `worktreeSetup`,
   `aiToolSettings`) so Claude-omitted sections survive. If the user really
   wants to remove a field, they can do so explicitly via the edit prompt
   (or via the regenerate path from #1).

Optional UX polish (not required to fix the bug): in the diff view,
highlight removed fields with a clearer marker (e.g. red `→ removed` rather
than `(missing)`), and default the dialog action hint when the diff touches
many fields.

No code changes in this stage — this is discovery only. Waiting on user
sign-off before moving to requirements.
