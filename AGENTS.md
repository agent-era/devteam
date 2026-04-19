# Coding Agent Team - Developer Guide

> For a complete and accurate architecture reference, read [`docs/README.md`](docs/README.md) first. The sections below are a quick-start guide; `docs/` is the authoritative source.

## Project Overview

A CLI tool that coordinates git worktrees, tmux sessions, AI agents (Claude/Gemini), and GitHub PR state across one or more projects. It is more than a worktree manager — it is a workspace coordinator for multi-repo AI-assisted development.

## Architecture

### Tech Stack
- **Runtime**: Node.js 18+ (ESM modules)
- **Framework**: Ink (React for CLI)
- **Language**: TypeScript with strict mode
- **Testing**: Jest with ts-jest
- **Build**: tsc compiler

### Core Concepts

#### 1. **Worktrees** 
Git worktrees allow multiple branches to be checked out simultaneously in different directories. This app manages worktrees in a structured way:
- Main projects: `{projects-directory}/{project-name}/`
- Feature branches: `{projects-directory}/{project-name}-branches/{feature-name}/`
- Archived features: `{projects-directory}/{project-name}-archived/archived-{timestamp}_{feature-name}/`

The projects directory is configurable:
- **CLI Argument**: `devteam --dir /path/to/projects`
- **Environment Variable**: `PROJECTS_DIR=/path/to/projects devteam`
- **Default**: Current working directory

#### 2. **Tmux Sessions**
Each worktree gets associated tmux sessions:
- Main session: `dev-{project}-{feature}` (for Claude AI)
- Shell session: `dev-{project}-{feature}-shell` (for terminal work)
- Run session: `dev-{project}-{feature}-run` (for executing commands)

#### 3. **AI Tool Integration**
The app supports multiple AI CLIs (Claude, Gemini) and monitors AI status in tmux panes:
- Working: Shows "esc to interrupt"
- Waiting: Shows numbered prompt (e.g., "1. ")
- Idle: Shows standard prompt
- Thinking: Shows thinking indicator

Tool preference is stored per-project in `.devteam/config.json`.
## Project Structure

See [`docs/reference/code-map.md`](docs/reference/code-map.md) for the full file map. Key layout:

```
src/
├── App.tsx                 # Root component; provider nesting
├── bootstrap.tsx           # Ink render entry
├── bin/devteam.ts          # CLI executable
├── cores/                  # Core engine classes (business logic, no React)
│   ├── WorktreeCore.ts     # Worktree list, sessions, git status
│   └── GitHubCore.ts       # PR status, cache, GitHub operations
├── engine/core-types.ts    # CoreBase<T> interface
├── contexts/               # React wrappers around Core engines
│   ├── WorktreeContext.tsx
│   ├── GitHubContext.tsx
│   ├── UIContext.tsx        # Navigation state machine (no Core behind it)
│   └── InputFocusContext.tsx
├── screens/                # Three full-screen components
│   ├── WorktreeListScreen.tsx
│   ├── CreateFeatureScreen.tsx
│   └── ArchiveConfirmScreen.tsx
├── services/               # Stateless external I/O (git, tmux, gh, disk)
├── components/             # UI components (dialogs, views, common)
├── hooks/                  # useKeyboardShortcuts and others
├── models.ts               # WorktreeInfo, PRStatus, GitStatus, SessionInfo
└── constants.ts            # AI_TOOLS, refresh intervals

tests/
├── fakes/                  # In-memory service implementations
│   └── stores.ts           # Shared memory data stores
├── utils/renderApp.tsx     # Test app renderer
├── unit/                   # Unit tests
└── e2e/                    # E2E tests (mock-rendered + terminal/)
```

## Coding Conventions

### TypeScript/React Patterns

1. **Import Style**: Use ESM imports with `.js` extension (even for TS files)
   ```typescript
   import {GitService} from '../services/GitService.js';
   ```

2. **JSX Syntax**: Use modern JSX syntax for React components
   ```tsx
   return (
     <Box flexDirection="column">
       <Text>Hello</Text>
     </Box>
   );
   ```

3. **File Extensions**: 
   - `.ts` for non-React files (services, utils, models)
   - `.tsx` for React components and contexts

4. **Class Models**: Use classes with constructor initialization
   ```typescript
   export class WorktreeInfo {
     project: string;
     feature: string;
     constructor(init: Partial<WorktreeInfo> = {}) {
       this.project = '';
       this.feature = '';
       Object.assign(this, init);
     }
   }
   ```

5. **Service Pattern**: Services are classes with dependency injection
   ```typescript
   export class WorktreeService {
     constructor(
       private gitService?: GitService,
       private tmuxService?: TmuxService
     ) {
       this.gitService = gitService || new GitService();
       this.tmuxService = tmuxService || new TmuxService();
     }
   }
   ```

6. **Context Providers**: Subscribe to a Core engine; re-render on state change
   ```tsx
   export function WorktreeProvider({children}) {
     const [state, setState] = useState(() => core.getState());

     useEffect(() => core.subscribe(setState), []);

     const value = { ...state, createFeature: core.createFeature.bind(core) };
     return (
       <WorktreeContext.Provider value={value}>
         {children}
       </WorktreeContext.Provider>
     );
   }
   ```

### Naming Conventions

- **Files**: camelCase for `.ts`, PascalCase for `.tsx`
- **Components**: PascalCase (e.g., `WorktreeListScreen`)
- **Hooks**: `use` prefix (e.g., `useKeyboardShortcuts`)
- **Services**: PascalCase with `Service` suffix
- **Constants**: UPPER_SNAKE_CASE
- **Interfaces**: PascalCase, often with `Info` or `State` suffix

### Architecture Layers

1. **Service Layer** (Stateless External I/O):
   - **GitService**: Local git operations (worktrees, branches, status, diff)
   - **GitHubService**: GitHub API operations (PRs, checks, issues)
   - **TmuxService**: Tmux session management
   - **WorkspaceService**: Workspace layout and disk operations
   - **PRStatusCacheService**: Disk cache for PR data
   - **AIToolService**: AI tool detection and preference
   - Services are stateless and only fetch/transform data; no mutable state

2. **Core Engine Layer** (Business Logic + State):
   - **WorktreeCore**: Owns worktree list, git status, session state; runs refresh loops
   - **GitHubCore**: Owns PR status; manages cache, throttled batch fetching
   - Cores implement `CoreBase<T>` with `subscribe(fn)` for React observation
   - No React dependency; fully testable as plain TypeScript

3. **Context Layer** (React Wrappers):
   - **WorktreeContext**: Subscribes to WorktreeCore; exposes state + operations as hooks
   - **GitHubContext**: Subscribes to GitHubCore; exposes PR operations
   - **UIContext**: Pure React state machine for navigation (no Core behind it)
   - **InputFocusContext**: Tracks which component owns keyboard focus

4. **Component Layer**: Thin components that use contexts; no business logic

## Testing Approach

### Philosophy
- **Minimal Mocking**: Only mock external dependencies (git, tmux, gh)
- **Real Components**: Run actual UI components in tests
- **In-Memory Database**: Fake services use memory stores
- **UI-Driven Testing**: Test through user interactions

### Test Structure

1. **Unit Tests** (`tests/unit/`): Test services and state logic in isolation
   ```typescript
   test('should create worktree', () => {
     const gitService = new FakeGitService();
     const result = gitService.createWorktree('project', 'feature');
     expect(result).toBe(true);
   });
   ```

2. **E2E Tests** (`tests/e2e/`): Full user workflows and cross-service interactions
  ```typescript
  test('complete feature workflow', async () => {
    const {result, stdin} = renderApp();
    stdin.write('n'); // Create new
    await delay(100);
    stdin.write('\r'); // Select project
    // ... continue workflow
  });
  ```

### E2E Flavors

- **tests/e2e/** (mock-rendered):
  - Uses `tests/utils/renderApp.tsx` (mock output driver) for deterministic frames.
  - Runs real app logic with in-memory fakes; avoids raw-mode/alt-screen quirks.
  - Fast and stable; preferred for most end-to-end flows.

- **tests/e2e/terminal/** (terminal-oriented, Node runner):
  - Uses Node scripts with Ink to verify real terminal rendering, avoiding Jest’s TTY/raw‑mode quirks.
  - Renders real Ink components and providers with fakes and asserts on terminal frames.
  - Command:
    - `npm run test:terminal` — builds the project, compiles fakes, and runs terminal checks:
      - `tests/e2e/terminal/run-smoke.mjs`: Ink <Text> smoke
      - `tests/e2e/terminal/run-mainview-list.mjs`: MainView rows render
      - `tests/e2e/terminal/run-app-full.mjs`: Full App providers render and list rows appear
  - Note: These scripts import from `dist/` and `dist-tests`; the script runs both builds.
  - Jest-based terminal tests were removed in favor of the Node runner; Jest E2E tests remain for app logic and flows.

### Running Tests
```bash
npm test                    # Run all Jest tests (unit + E2E)
npm run test:watch         # Jest watch mode
npm run typecheck          # Type checking only
npm run test:terminal      # Run terminal rendering tests (Node runner)
```

## Adding Features

### 1. New Dialog Component

Create in `src/components/dialogs/`:
```tsx
import React from 'react';
import {Box, Text} from 'ink';

interface MyDialogProps {
  title: string;
  onClose: () => void;
}

export default function MyDialog({title, onClose}: MyDialogProps) {
  return (
    <Box flexDirection="column">
      <Text>{title}</Text>
      {/* Dialog content */}
    </Box>
  );
}
```

### 2. New Service (Stateless)

Create in `src/services/`:
```typescript
export class MyService {
  fetchData(params: any): Promise<DataType[]> {
    // Fetch and transform data only - no state
    return runCommand(['some-command', params]);
  }
  
  transformData(raw: any): DataType {
    // Pure transformation functions
    return new DataType(raw);
  }
}
```

### 3. New Context (React wrapper around a Core engine)

Create in `src/contexts/`:
```typescript
export function MyContextProvider({children}) {
  const [state, setState] = useState(() => myCore.getState());

  useEffect(() => myCore.subscribe(setState), []);

  const value = { ...state, doThing: myCore.doThing.bind(myCore) };
  return <MyContext.Provider value={value}>{children}</MyContext.Provider>;
}
```

### 4. New Screen (Using Contexts)

Create in `src/screens/`:
```tsx
import React from 'react';
import {Box} from 'ink';
import {useMyContext} from '../contexts/MyContext.js';
import {useUIContext} from '../contexts/UIContext.js';

export default function MyScreen() {
  const {data, loading, createItem} = useMyContext();
  const {showList} = useUIContext();
  
  return (
    <Box>
      {/* Screen content that uses context state and operations */}
    </Box>
  );
}
```

## Complex Operations

For multi-step operations, use `src/ops.ts`:
```typescript
export async function complexOperation(
  services: Services,
  params: OperationParams
): Promise<Result> {
  // Step 1: Validate
  // Step 2: Execute
  // Step 3: Update state
  return result;
}
```

## Environment Variables

The app copies these files to worktrees:
- `.env.local` - Environment variables
- `.claude/settings.local.json` - Claude settings
- `CLAUDE.md` - Claude documentation

## Performance Considerations

1. **Refresh Rates**: Different refresh intervals for different data:
   - AI Status: 2s
   - Git Status: 5s  
   - PR Status: 30s
   - Full Refresh: 30s

2. **Pagination**: List views paginate at 20 items by default

3. **Memory Management**: Fake services clear old data periodically

## Common Patterns

### Error Handling
```typescript
try {
  const result = runCommand(['git', 'status']);
  return result;
} catch (error) {
  // Silent fail for UI operations
  return null;
}
```

### Async Operations
```typescript
const loadData = async () => {
  const data = await fetchPRStatus();
  setState(prev => ({...prev, prStatus: data}));
};
```

### Keyboard Shortcuts
```typescript
useKeyboardShortcuts({
  onMove: (delta) => moveSelection(delta),
  onSelect: () => handleSelect(),
  onCreate: () => setMode('create')
});
```

## Logging and Debugging

### File Logging System

The app includes comprehensive file-based logging for all console output and errors:

#### Log Files Location
```
./logs/
├── errors.log    # Error messages and stack traces
└── console.log   # All console output (log, warn, info, debug)
```

#### Using the Logger

1. **Automatic Console Logging**: All `console.log`, `console.error`, `console.warn`, `console.info`, and `console.debug` calls are automatically logged to files when `initializeFileLogging()` is called.

2. **Manual Logging Functions**: Use these functions for structured logging:
   ```typescript
   import {logError, logInfo, logWarn, logDebug} from '../shared/utils/logger.js';
   
   logError('Database connection failed', error);
   logInfo('User created successfully', {userId: 123});
   logWarn('API rate limit approaching', {remaining: 10});
   logDebug('Cache hit', {key: 'user:123'});
   ```

3. **Log Management**:
   ```typescript
   import {getLogPaths, clearLogs} from '../shared/utils/logger.js';
   
   // Get log file paths
   const {errorLog, consoleLog} = getLogPaths();
   
   // Clear all logs
   clearLogs();
   ```

#### Log Format
Each log entry includes:
- ISO timestamp
- Log level (ERROR, LOG, WARN, INFO, DEBUG)
- Message
- Data object (JSON formatted if provided)

Example:
```
[2025-08-27T10:30:45.123Z] ERROR: Database connection failed {"host":"localhost","port":5432}
[2025-08-27T10:30:46.456Z] INFO: User login successful {"userId":123,"email":"user@example.com"}
```

#### Log Rotation
- Logs automatically rotate when they exceed 10MB
- Old logs are renamed with timestamp suffix: `errors.log.1724765445123`
- Silent failure ensures logging issues never crash the app

### Debugging Tips

1. **File Logs**: Check `./logs/` for detailed error traces and debug info
2. **Console Output**: Use `console.error()` (stdout is used by Ink) 
3. **Test Mode**: Run with fake services for testing
4. **Tmux Inspection**: Check sessions with `tmux ls`
5. **Log Analysis**: Use `tail -f ./logs/errors.log` to monitor errors in real-time

### Best Practices for Logging

1. **Error Logging**: Always log errors with context:
   ```typescript
   try {
     await createWorktree(project, feature);
   } catch (error) {
     logError('Failed to create worktree', {project, feature, error});
     throw error;
   }
   ```

2. **Debug Information**: Log debug info for complex operations:
   ```typescript
   logDebug('Starting worktree creation', {project, feature, targetPath});
   ```

3. **Performance Monitoring**: Log timing for slow operations:
   ```typescript
   const start = Date.now();
   await longOperation();
   logInfo('Operation completed', {duration: Date.now() - start});
   ```

## Build & Deployment

```bash
npm run build         # Compile TypeScript
npm run typecheck    # Check types only
npm link            # Install globally as 'devteam'
```

## Best Practices

### Architecture
1. **Services are stateless** - only fetch and transform data
2. **Core engines own state** - business logic and refresh loops live in `src/cores/`
3. **Contexts are thin wrappers** - subscribe to a Core, expose state + operations via hooks
4. **Clear separation** - GitService (local git) vs GitHubService (GitHub API)

### Implementation  
5. **Always use absolute paths** in file operations
6. **Check for existence** before file operations
7. **Silent fail** for UI operations to prevent crashes
8. **Use memory stores** in tests for isolation
9. **Follow existing patterns** when adding features
10. **Test through UI interactions** not implementation details
11. **Use TypeScript strict mode** for safety

## Testing Checklist

When adding features:
- [ ] Add unit tests for new services
- [ ] Add E2E tests for user workflows and cross-service interactions
- [ ] Update fake implementations
- [ ] Verify TypeScript types compile
- [ ] Test error cases and edge conditions

## Feature Checklist
- [ ] Show the user a well-researched, high-level plan to implement the feature that uses above guidelines, best design practices and values simplicity in the implementation.
- [ ] Implement, and ensure that the feature logic is tested using the above guidelines
- [ ] Build and test and do a typecheck
- [ ] Make a PR using the current branch
