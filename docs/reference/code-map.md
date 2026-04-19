# Code Map

If you need to find or change X, start here.

## Entry points

| What | File |
|------|------|
| CLI entry | `src/bin/devteam.ts` |
| App bootstrap | `src/bootstrap.tsx` |
| Root React component | `src/App.tsx` |

## State and business logic

| What | File |
|------|------|
| Worktree list, sessions, git status | `src/cores/WorktreeCore.ts` |
| PR status, GitHub cache | `src/cores/GitHubCore.ts` |
| CoreBase interface | `src/engine/core-types.ts` |
| UI navigation state machine | `src/contexts/UIContext.tsx` |
| Worktree context (React wrapper) | `src/contexts/WorktreeContext.tsx` |
| GitHub context (React wrapper) | `src/contexts/GitHubContext.tsx` |
| Keyboard focus | `src/contexts/InputFocusContext.tsx` |

## Services (external I/O)

| What | File |
|------|------|
| Git operations | `src/services/GitService.ts` |
| GitHub API (gh CLI) | `src/services/GitHubService.ts` |
| Tmux sessions | `src/services/TmuxService.ts` |
| Workspace layout | `src/services/WorkspaceService.ts` |
| PR disk cache | `src/services/PRStatusCacheService.ts` |
| AI tool detection | `src/services/AIToolService.ts` |
| Memory monitoring | `src/services/MemoryMonitorService.ts` |
| Diff comment store | `src/services/CommentStoreManager.ts` |
| Version checking | `src/services/VersionCheckService.ts` |

## Data models

| What | File |
|------|------|
| WorktreeInfo, PRStatus, GitStatus, SessionInfo, ProjectInfo | `src/models.ts` |
| App constants (AI_TOOLS, refresh intervals) | `src/constants.ts` |
| App configuration (projects dir, etc.) | `src/config.ts` |

## Screens

| What | File |
|------|------|
| Main worktree list | `src/screens/WorktreeListScreen.tsx` |
| Feature creation | `src/screens/CreateFeatureScreen.tsx` |
| Archive confirmation | `src/screens/ArchiveConfirmScreen.tsx` |

## Key components

| What | File |
|------|------|
| Diff viewer | `src/components/views/DiffView.tsx` |
| Global keyboard shortcuts | `src/hooks/useKeyboardShortcuts.ts` |
| Settings dialog | `src/components/dialogs/SettingsDialog.tsx` |
| Branch picker | `src/components/dialogs/BranchPickerDialog.tsx` |
| AI tool picker | `src/components/dialogs/AIToolDialog.tsx` |
| Help overlay | `src/components/dialogs/HelpOverlay.tsx` |

## Tests

| What | Where |
|------|-------|
| Unit tests | `tests/unit/` |
| E2E tests (React + fakes) | `tests/e2e/` |
| Terminal rendering tests | `tests/e2e/terminal/` |
| Fake service implementations | `tests/fakes/` |
| In-memory data stores for fakes | `tests/fakes/stores.ts` |
| App renderer for tests | `tests/utils/renderApp.tsx` |
