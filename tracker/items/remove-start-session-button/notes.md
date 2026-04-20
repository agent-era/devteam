## User problem

The item details screen (`src/screens/TrackerItemScreen.tsx:42`) shows a `Start {stage} session` action that calls `handleCurrentStageWork` → `launchSessionForItem` (`src/App.tsx:251`), which attaches the tmux session **and sends an initial planning prompt** built from the stage config.

Since item creation now auto-creates the session in the background (`launchSessionForItemBackground`, `src/App.tsx:267`), this button's prompt-sending behavior is redundant and, worse, re-sends the stage prompt every time the user opens the item — polluting the running agent. The user just wants to jump into the already-running session.

## Recommendation

Replace the `Start {stage} session` action with an **Attach session** action that calls `attachSession(worktree)` with **no `initialPrompt`** — mirroring the existing pattern in `TrackerBoardScreen.tsx:241` and `WorktreeListScreen.tsx:125`.

Because `createSessionIfNeeded` (called inside `attachSession`) is idempotent, this still works as a fallback: if the background-creation flow failed or the session was killed, it re-creates the session (without a prompt) before attaching. No need for a separate "continue" vs "attach" split — one button covers both.

Notes for later stages:
- The `onCurrentStageWork` prop / `handleCurrentStageWork` wiring can be renamed (e.g., `onAttachSession`) but that's cosmetic.
- The stage-advance action (`stage-action`, `src/screens/TrackerItemScreen.tsx:47`) stays as-is — it still needs to send a prompt for the *new* stage.
- `prepareItemSession` / `launchSessionForItem` / `buildPromptForItem` may become unused after this change; check and remove in the implementation stage.
