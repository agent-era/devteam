# Tmux Session Manager - Developer Guide

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
- Main projects: `~/projects/{project-name}/`
- Feature branches: `~/projects/{project-name}-branches/{feature-name}/`
- Archived features: `~/projects/{project-name}-archived/archived-{timestamp}_{feature-name}/`

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
├── app.ts                  # App bootstrap (Ink render)
├── App.tsx                 # Main React component
├── bin/                    # CLI binary
│   └── dev-sessions.ts     # CLI executable
├── components/             # React/Ink UI components
│   ├── common/            # Shared components
│   ├── dialogs/           # Modal dialogs
│   └── views/             # Main views
├── contexts/              # React contexts
│   ├── AppStateContext.tsx    # Global app state
│   └── ServicesContext.tsx    # Service DI container
├── hooks/                 # React hooks
│   ├── useKeyboardShortcuts.ts  # Keyboard handling
│   ├── usePRStatus.ts          # PR status fetching
│   └── useWorktrees.ts         # Worktree management
├── screens/               # Full-screen components
│   ├── WorktreeListScreen.tsx   # Main list view
│   ├── CreateFeatureScreen.tsx  # Feature creation
│   ├── ArchiveConfirmScreen.tsx # Archive confirmation
│   └── ArchivedScreen.tsx       # Archived items view
├── services/              # Business logic layer
│   ├── GitService.ts           # Git operations
│   ├── TmuxService.ts          # Tmux management
│   └── WorktreeService.ts      # Worktree orchestration
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
├── integration/           # Integration tests
└── e2e/                   # End-to-end tests
```

## Coding Conventions

### TypeScript/React Patterns

1. **Import Style**: Use ESM imports with `.js` extension (even for TS files)
   ```typescript
   import {GitService} from '../services/GitService.js';
   ```

2. **React Without JSX**: Use `React.createElement` via `h` helper
   ```typescript
   const h = React.createElement;
   return h(Box, {flexDirection: 'column'}, 
     h(Text, null, 'Hello')
   );
   ```

3. **Class Models**: Use classes with constructor initialization
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

4. **Service Pattern**: Services are classes with dependency injection
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

5. **Context Providers**: Use React Context for dependency injection
   ```typescript
   export function ServicesProvider({children, gitService, tmuxService}) {
     const services = {
       gitService: gitService || new GitService(),
       tmuxService: tmuxService || new TmuxService()
     };
     return h(ServicesContext.Provider, {value: services}, children);
   }
   ```

### Naming Conventions

- **Files**: camelCase for `.ts`, PascalCase for `.tsx`
- **Components**: PascalCase (e.g., `WorktreeListScreen`)
- **Hooks**: `use` prefix (e.g., `useWorktrees`)
- **Services**: PascalCase with `Service` suffix
- **Constants**: UPPER_SNAKE_CASE
- **Interfaces**: PascalCase, often with `Info` or `State` suffix

### State Management

1. **App State**: Centralized in `AppStateContext`
   ```typescript
   const {state, setState, updateState} = useAppState();
   updateState({selectedIndex: 5});
   ```

2. **Service State**: Services maintain their own state (e.g., memory stores in fakes)

3. **UI State**: Local component state for UI-only concerns

## Testing Approach

### Philosophy
- **Minimal Mocking**: Only mock external dependencies (git, tmux, gh)
- **Real Components**: Run actual UI components in tests
- **In-Memory Database**: Fake services use memory stores
- **UI-Driven Testing**: Test through user interactions

### Test Structure

1. **Unit Tests** (`tests/unit/`): Test services in isolation
   ```typescript
   test('should create worktree', () => {
     const gitService = new FakeGitService();
     const result = gitService.createWorktree('project', 'feature');
     expect(result).toBe(true);
   });
   ```

2. **Integration Tests** (`tests/integration/`): Test service interactions
   ```typescript
   test('should create feature with session', () => {
     const {result} = renderApp();
     // Simulate user actions
     result.rerender();
     expect(memoryStore.sessions.size).toBe(1);
   });
   ```

3. **E2E Tests** (`tests/e2e/`): Full user workflows
   ```typescript
   test('complete feature workflow', async () => {
     const {result, stdin} = renderApp();
     stdin.write('n'); // Create new
     await delay(100);
     stdin.write('\r'); // Select project
     // ... continue workflow
   });
   ```

### Running Tests
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run typecheck          # Type checking only
```

## Adding Features

### 1. New Dialog Component

Create in `src/components/dialogs/`:
```typescript
import React from 'react';
import {Box, Text} from 'ink';

const h = React.createElement;

interface MyDialogProps {
  title: string;
  onClose: () => void;
}

export default function MyDialog({title, onClose}: MyDialogProps) {
  return h(Box, {flexDirection: 'column'},
    h(Text, null, title),
    // Dialog content
  );
}
```

### 2. New Service

Create in `src/services/`:
```typescript
export class MyService {
  private dependency: OtherService;
  
  constructor(dependency?: OtherService) {
    this.dependency = dependency || new OtherService();
  }
  
  doSomething(): void {
    // Implementation
  }
}
```

Add to `ServicesContext`:
```typescript
interface Services {
  // ... existing services
  myService: MyService;
}
```

### 3. New Hook

Create in `src/hooks/`:
```typescript
import {useState, useEffect} from 'react';
import {useServices} from '../contexts/ServicesContext.js';

export function useMyFeature() {
  const {myService} = useServices();
  const [data, setData] = useState(null);
  
  useEffect(() => {
    // Setup logic
  }, []);
  
  return {data};
}
```

### 4. New Screen

Create in `src/screens/`:
```typescript
import React from 'react';
import {Box} from 'ink';
import {useAppState} from '../contexts/AppStateContext.js';

const h = React.createElement;

export default function MyScreen() {
  const {state} = useAppState();
  
  return h(Box, null, 
    // Screen content
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

## Debugging

1. **Console Output**: Use `console.error()` (stdout is used by Ink)
2. **Test Mode**: Run with fake services for testing
3. **Tmux Inspection**: Check sessions with `tmux ls`

## Build & Deployment

```bash
npm run build         # Compile TypeScript
npm run typecheck    # Check types only
npm link            # Install globally as 'dev-sessions'
```

## Best Practices

1. **Always use absolute paths** in file operations
2. **Check for existence** before file operations
3. **Silent fail** for UI operations to prevent crashes
4. **Use memory stores** in tests for isolation
5. **Follow existing patterns** when adding features
6. **Test through UI interactions** not implementation details
7. **Keep services stateless** when possible
8. **Use TypeScript strict mode** for safety

## Testing Checklist

When adding features:
- [ ] Add unit tests for new services
- [ ] Add integration tests for service interactions
- [ ] Add E2E tests for user workflows
- [ ] Update fake implementations
- [ ] Verify TypeScript types compile
- [ ] Test error cases and edge conditions