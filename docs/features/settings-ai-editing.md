# Settings and AI Editing

## Goal

Let users generate or modify the per-project `.devteam/config.json` using an AI agent, without leaving the CLI.

## User path

1. Press `S` (capital) on a worktree row, or access settings from the info dialog.
2. UIContext transitions to `settings` mode with `settingsProject` set.
3. `SettingsDialog` shows current config content (read via `WorktreeCore.readConfigContent()`).
4. User chooses:
   - **Edit** — User types instructions; AI edits the existing config. The edit prompt requires Claude to echo every existing field verbatim, so narrow edits can't silently drop sections.
   - **Regenerate from scratch** — press `R` and confirm. The AI writes a fresh config without seeing the current one, so this is gated behind a destructive-action confirmation. There is no "empty Enter regenerates" shortcut.
5. `WorktreeCore.generateConfigWithAI()` or `editConfigWithAI()` is called:
   - Opens a temporary tmux session
   - Sends a prompt to the AI agent
   - Waits for the agent to write the file and exit
   - Closes the session
6. UIContext stores the result in `settingsAIResult` (`{ project, success, content, error }`).
7. The result is shown in the settings dialog or as a notification.

## Re-apply files

After the AI edits config, the user can press **Re-apply** to copy the updated files from the main worktree into all feature worktrees. This is useful when `CLAUDE.md` or other shared files were also updated.

## Diff review

The AI's proposed config is shown as a diff against the current config before apply. Rows are classified as **added** (`+`), **changed** (`~`), or **removed** (`-`). Removed rows render in red with a prominent `REMOVED` label and are sorted to the top; a warning banner appears when any field will be removed, so a Claude response that silently drops a section is impossible to miss when the user presses `[a]` to apply.

## settingsAIResult persistence

`settingsAIResult` is not cleared by `resetUIState()`. This allows the AI to finish its work even if the user navigates away from the settings dialog. The result is surfaced the next time the settings dialog is opened.

## Timeout

AI editing has a 5-minute timeout. If the agent session does not complete within that window, the operation is marked as failed and the result reflects the error.

## Modules

- `src/components/dialogs/SettingsDialog.tsx` — UI
- `src/cores/WorktreeCore.ts` — `readConfigContent()`, `generateConfigWithAI()`, `editConfigWithAI()`, `applyConfig()`
- `src/services/AIToolService.ts` — tool detection
- `src/contexts/UIContext.tsx` — `beginSettingsAI()`, `finishSettingsAI()`, `clearSettingsAIResult()`
