# Coding Agent Team - Developer Guide

## Project Overview

A CLI-based tmux session manager built with TypeScript, React, and Ink. This tool manages development sessions for feature branches across multiple projects, integrating with git worktrees and Claude AI.

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
- **CLI Argument**: `dev-sessions --dir /path/to/projects`
- **Environment Variable**: `PROJECTS_DIR=/path/to/projects dev-sessions`
- **Default**: Current working directory

#### 2. **Tmux Sessions**
Each worktree gets associated tmux sessions:
- Main session: `dev-{project}-{feature}` (for Claude AI)
- Shell session: `dev-{project}-{feature}-shell` (for terminal work)
- Run session: `dev-{project}-{feature}-run` (for executing commands)

#### 3. **Claude Integration**
The app monitors Claude AI status in tmux panes:
- Working: Shows "esc to interrupt"
- Waiting: Shows numbered prompt (e.g., "1. ")
- Idle: Shows standard prompt
- Thinking: Shows thinking indicator
## Project Structure

```
src/
├── index.ts                 # Entry point
├── bootstrap.tsx           # App bootstrap (Ink render)
├── App.tsx                 # Main React component
├── bin/                    # CLI binary
│   └── dev-sessions.ts     # CLI executable
├── components/             # React/Ink UI components
│   ├── common/            # Shared components
│   ├── dialogs/           # Modal dialogs
│   └── views/             # Main views
├── contexts/              # React contexts (State + Operations)
│   ├── WorktreeContext.tsx    # Worktree state and operations
│   ├── GitHubContext.tsx      # PR status and GitHub operations
│   └── UIContext.tsx          # UI navigation and dialog state
├── hooks/                 # React hooks
│   ├── useKeyboardShortcuts.ts  # Keyboard handling
│   ├── usePRStatus.ts          # PR status fetching
│   └── useWorktrees.ts         # Worktree management
├── screens/               # Full-screen components
│   ├── WorktreeListScreen.tsx   # Main list view
│   ├── CreateFeatureScreen.tsx  # Feature creation
│   ├── ArchiveConfirmScreen.tsx # Archive confirmation
│   └── ArchivedScreen.tsx       # Archived items view
├── services/              # Stateless data operations
│   ├── GitService.ts           # Local git operations
│   ├── GitHubService.ts        # GitHub API operations
│   ├── TmuxService.ts          # Tmux session management
│   └── WorktreeService.ts      # Git + Tmux orchestration
├── shared/utils/          # Utility functions
│   ├── commandExecutor.ts      # Process execution
│   ├── fileSystem.ts           # File operations
│   ├── formatting.ts           # String formatting
│   └── gitHelpers.ts           # Git utilities
├── models.ts              # Data models/classes
├── constants.ts           # App constants
└── ops.ts                 # Complex operations

tests/
├── fakes/                 # Fake service implementations
│   ├── FakeGitService.ts       # In-memory git
│   ├── FakeTmuxService.ts      # In-memory tmux
│   ├── FakeWorktreeService.ts  # In-memory worktree
│   └── stores.ts               # Memory data stores
├── utils/                 # Test utilities
│   ├── renderApp.tsx           # Test app rendering
│   └── testHelpers.ts          # Setup helpers
├── unit/                  # Unit tests
└── e2e/                   # End-to-end tests
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

6. **Context Providers**: Use React Context for state + operations
   ```tsx
   export function WorktreeProvider({children}) {
     const [worktrees, setWorktrees] = useState([]);
     const gitService = new GitService();
     const tmuxService = new TmuxService();
     
     const createFeature = async (project, name) => {
       await gitService.createWorktree(project, name);
       await tmuxService.createSession(project, name);
       refresh();
     };
     
     const value = { worktrees, createFeature, refresh };
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
- **Hooks**: `use` prefix (e.g., `useWorktrees`)
- **Services**: PascalCase with `Service` suffix
- **Constants**: UPPER_SNAKE_CASE
- **Interfaces**: PascalCase, often with `Info` or `State` suffix

### Architecture Layers

1. **Service Layer** (Stateless Data Operations):
   - **GitService**: Local git operations (worktrees, branches, status, diff)
   - **GitHubService**: GitHub API operations (PRs, checks, issues)
   - **TmuxService**: Tmux session management
   - **WorktreeService**: Orchestrates git + tmux operations
   - Services are stateless and only fetch/transform data

2. **Context Layer** (State Management + Operations):
   - **WorktreeContext**: Manages worktree state and operations
   - **GitHubContext**: Manages PR status cache and GitHub operations
   - **UIContext**: Manages UI navigation and dialog state
   - Contexts combine state management with operation methods

3. **Component Layer**: Thin components that use contexts

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

### 3. New Context (State + Operations)

Create in `src/contexts/`:
```typescript
export function MyContextProvider({children}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const myService = new MyService();
  
  const loadData = async () => {
    setLoading(true);
    const result = await myService.fetchData();
    setData(result);
    setLoading(false);
  };
  
  const createItem = async (item) => {
    await myService.createItem(item);
    loadData(); // Refresh state
  };
  
  const value = { data, loading, loadData, createItem };
  return h(MyContext.Provider, {value}, children);
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
npm link            # Install globally as 'dev-sessions'
```

## Best Practices

### Architecture
1. **Services are stateless** - only fetch and transform data
2. **Contexts manage state** - combine state with operation methods
3. **Clear separation** - GitService (local) vs GitHubService (API)
4. **No dependency injection** - services instantiated directly in contexts

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
- [ ] Make a PR
