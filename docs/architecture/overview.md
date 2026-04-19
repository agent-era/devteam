# Architecture Overview

DevTeam coordinates four external systems — git, tmux, AI CLIs, and GitHub — through a React/Ink CLI interface.

## Major components

```
┌─────────────────────────────────────────────────────┐
│  Ink CLI (React for terminals)                      │
│                                                     │
│  App.tsx                                            │
│  ├─ InputFocusProvider                              │
│  ├─ GitHubProvider  (GitHubCore engine)             │
│  └─ WorktreeProvider (WorktreeCore engine)          │
│      └─ UIProvider   (navigation state machine)     │
│          └─ AppContent (screen router)              │
└─────────────────────────────────────────────────────┘
          │                    │
    WorktreeCore          GitHubCore
          │                    │
    ┌─────┴──────┐       ┌────┴──────────┐
    │  Services  │       │  PRStatusCache │
    │  Git       │       │  GitHubService │
    │  Tmux      │       └───────────────┘
    │  Workspace │
    │  AITool    │
    └────────────┘
```

## Boundaries

**Core engines** (`src/cores/`) hold all mutable state and business logic. They are plain TypeScript classes that implement `CoreBase<T>` and expose a `subscribe(fn)` method for React to observe.

**Contexts** (`src/contexts/`) are thin React wrappers around Core engines. They call `useEffect` to subscribe to the Core and re-render on state change. All operations the UI needs are re-exported from the context.

**Services** (`src/services/`) are stateless. They execute external commands (git, tmux, gh CLI) and return data. They hold no mutable state and have no knowledge of React.

**Screens** (`src/screens/`) and **components** (`src/components/`) are pure UI. They read state and dispatch operations through contexts; they contain no business logic.

**UIContext** is the exception: it is a pure React state machine with no Core engine behind it. It owns only navigation mode and transient dialog data.

## Data flow

```
External system (git/tmux/github)
   → Service method (fetch/parse)
   → Core engine (update state, notify subscribers)
   → Context (re-render React tree)
   → Screen/component (display)
```

User actions flow in reverse: keyboard shortcut → context method → Core method → Service call → state update → re-render.

## Screens

Three full-screen components exist:
- `WorktreeListScreen` — main list; always rendered, shown/hidden by UI mode
- `CreateFeatureScreen` — multi-project worktree creation
- `ArchiveConfirmScreen` — archive confirmation with untracked file warning

All other views (diff, dialogs, overlays) are rendered as layered components on top of the list screen, not as separate screens.

## Source of truth

| Data | Owner |
|------|-------|
| Worktree list, git status, session status | `WorktreeCore` |
| PR status | `GitHubCore` + disk cache (`PRStatusCacheService`) |
| UI navigation mode | `UIContext` |
| Project config | `.devteam/config.json` on disk |
| AI tool preference | `.devteam/config.json` (written by `AIToolService`) |
