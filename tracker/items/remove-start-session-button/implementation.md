# Implementation notes

## What was built

Replaced the `Start {stage} session` action on `TrackerItemScreen` with an `Attach session` action that attaches to the tracker item's agent tmux session **without sending any initial prompt**. The stage-advance action (`stage-action`) is unchanged — it still sends the next-stage planning prompt on promotion.

## Changes

- **`src/screens/TrackerItemScreen.tsx`**
  - Renamed prop `onCurrentStageWork` → `onAttachSession`.
  - Renamed action `{id: 'current-stage', label: 'Start ${stageLabel} session'}` → `{id: 'attach-session', label: 'Attach session'}`. The label is now stage-agnostic (no longer interpolates `STAGE_LABELS[item.stage]`) — the stage context is already shown in the header.
  - Exported `buildActions` so it can be unit-tested.

- **`src/App.tsx`**
  - Extracted `ensureItemWorktree(project, item)` from `prepareItemSession` — it finds or recreates the worktree and runs `tracker.ensureItemFiles`, without building a prompt. `prepareItemSession` now delegates to it.
  - Added `handleAttachSession(item)`: ensures the worktree, handles the `needsToolSelection` branch (opens `AIToolDialog` with **no** `initialPrompt`), then calls `attachSession(worktree)` with no prompt.
  - Removed `handleCurrentStageWork`. Wired `onAttachSession={() => handleAttachSession(trackerItem)}` in the `TrackerItemScreen` render.
  - Left `launchSessionForItem` / `prepareItemSession` / `buildPromptForItem` in place — they're still used by `handleStageAction` (stage advance) and `launchSessionForItemBackground` (item-creation background launch).

- **`tests/unit/tracker-item-screen-actions.test.ts`** (new)
  - Tests `buildActions` directly: first action is `{id: 'attach-session', label: 'Attach session'}`; no `Start … session` label or `current-stage` id is present (regression guard); stage-advance action is still present for non-terminal stages; archived items still get no actions.

## Key decisions

1. **Single "Attach session" button covers both attach and create.** `WorktreeCore.attachSession` → `createSessionIfNeeded` is idempotent — if the tmux session already exists it just attaches; if it doesn't exist (or the worktree itself is missing), it creates them before attaching. This matches the pattern already used by `TrackerBoardScreen.tsx:241` and `WorktreeListScreen.tsx:125`, so no new UX branch for "attach vs continue vs create" is needed.

2. **No prompt on fresh tmux session either.** When the tmux session is missing, claude is launched with no `initialPrompt` — the agent starts a plain shell-wrapped session. This is intentional: the whole point of this change is that the button must not push input to the agent, ever.

3. **Label is no longer stage-scoped.** The old `Start {stage} session` told the user both *what* the button does and *which stage* it targets. The new button only does one thing across all stages, and the stage is already visible in the header line right above the actions, so repeating it in the button label would be noise.

4. **`launchSessionForItem` kept, not deleted.** Acceptance criterion 6 said to remove it if unused. It's still used by `handleStageAction` for the stage-advance flow (which legitimately sends a prompt), so it stays.

## Follow-up: `a` on the kanban board attaches directly

While polishing, the user flagged that pressing `a` on `TrackerBoardScreen` was falling through to `onSelect` (opening the item details screen) whenever the item's tmux session wasn't running, because `onAttach` was gated on `currentItemSession`. That's exactly the prompt-free-attach flow we just built, so pressing `a` should do it too — it should never land the user on the details screen.

- **`src/screens/TrackerBoardScreen.tsx`**
  - Added `onAttachItem: (item: TrackerItem) => void` prop.
  - Rewrote `handleAttach` to call `onAttachItem(currentItem)` instead of `attachSession(sessWt)` directly. Dropped the `getSessionForItem` guard so `a` works whether or not a session is currently running — the shared `handleAttachSession` flow in `App.tsx` already creates the worktree/session on demand.
  - Orphan-item materialization (previously only in `onSelect`) is mirrored in `handleAttach` so orphans don't hit an empty-`requirementsPath` attach.
  - `useKeyboardShortcuts` gets `onAttach` unconditionally when a `currentItem` exists (no more `currentItemSession ?` fallthrough to `onSelect`).
  - Removed the now-unused `attachSession` destructure from `useWorktreeContext`.
  - Footer: the `a attach` hint now shows whenever an item is selected (dimmed when no session is running, highlighted yellow when one is) — previously it was hidden entirely without a session, even though the new behavior makes `a` always useful.

- **`src/App.tsx`**
  - Wired `onAttachItem={(item) => handleAttachSession(item)}` on the `TrackerBoardScreen` render — board and item-detail screens now share one attach handler.

## Notes for cleanup

- No dead code introduced; no dead code left behind that I could find from this change.
- Typecheck and full Jest suite (614 tests) pass. Build passes.
- Terminal E2E (`npm run test:terminal`) was not run — the changed screen isn't covered by the existing terminal snapshots and the behavior is UI-interactive (session attach), which the mock-rendered tests don't simulate. The unit test covers the action-wiring regression.
- Consider renaming the file `handleAttachSession` if you later consolidate tracker-session handlers; it's currently a one-off.
