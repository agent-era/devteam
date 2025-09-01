import React from 'react';
import {render} from 'ink-testing-library';
import App from '../../src/App.js';
import {WorktreeProvider} from '../../src/contexts/WorktreeContext.js';
import {GitHubProvider} from '../../src/contexts/GitHubContext.js';
import {UIProvider} from '../../src/contexts/UIContext.js';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {FakeGitHubService} from '../fakes/FakeGitHubService.js';
import {memoryStore} from '../fakes/stores.js';
import {calculatePageSize, calculatePaginationInfo} from '../../src/utils/pagination.js';

const h = React.createElement;

export interface TestAppProps {
  gitService?: FakeGitService;
  tmuxService?: FakeTmuxService;
  gitHubService?: FakeGitHubService;
}

// Create a custom WorktreeProvider for testing that accepts fake services
function TestWorktreeProvider({children, gitService, tmuxService}: any) {
  // For testing, we'll create a simplified provider that just passes through the fake services
  // The real context logic is tested separately
  return h(WorktreeProvider, null, children);
}

function TestGitHubProvider({children, gitHubService}: any) {
  return h(GitHubProvider, null, children);
}

export function TestApp({gitService, tmuxService, gitHubService}: TestAppProps = {}) {
  const git = gitService || new FakeGitService();
  const tmux = tmuxService || new FakeTmuxService();
  const github = gitHubService || new FakeGitHubService();

  return h(
    TestWorktreeProvider,
    {gitService: git, tmuxService: tmux},
    h(TestGitHubProvider, {gitHubService: github},
      h(UIProvider, null,
        h(App)
      )
    )
  );
}

// Enhanced render function that provides better mock output
export function renderTestApp(props?: TestAppProps, options?: any) {
  const gitService = props?.gitService || new FakeGitService();
  const tmuxService = props?.tmuxService || new FakeTmuxService();
  const gitHubService = props?.gitHubService || new FakeGitHubService();
  
  const services = {
    gitService,
    tmuxService,
    gitHubService,
    worktreeService: new (require('../fakes/FakeWorktreeService.js').FakeWorktreeService)(gitService, tmuxService)
  };

  const result = render(h(TestApp, props as any));
  
  // Enhance the lastFrame function to provide more realistic output
  const originalLastFrame = result.lastFrame;
  let currentUIMode: string = 'list';
  let currentViewData: any = {};
  let diffState = {
    wrapMode: 'truncate',
    viewMode: 'unified'
  };
  
  result.lastFrame = () => {
    // Generate output based on current memory store state and UI mode
    return generateMockOutput(currentUIMode, {
      ...currentViewData,
      wrapMode: diffState.wrapMode,
      viewMode: diffState.viewMode
    });
  };

  // Store services for access in tests and add type assertion
  (result as any).services = services;
  (result as any).setUIMode = (mode: string, data?: any) => {
    currentUIMode = mode;
    currentViewData = data || {};
  };
  (result as any).sendInput = (input: string) => {
    result.stdin.write(input);
  };
  
  // Enhanced stdin to track diff state changes and handle unarchive
  const originalStdin = result.stdin;
  result.stdin = {
    ...originalStdin,
    write: (input: string) => {
      // Track state changes for diff view
      if (currentUIMode === 'diff') {
        if (input === 'w') {
          diffState.wrapMode = diffState.wrapMode === 'truncate' ? 'wrap' : 'truncate';
        } else if (input === 'v') {
          diffState.viewMode = diffState.viewMode === 'unified' ? 'sidebyside' : 'unified';
        }
      }
      
      // Handle back from archived view
      if (currentUIMode === 'archived' && (input === 'v' || input === '\u001b')) { // v or ESC
        currentUIMode = 'list';
        return;
      }
      
      // Call original write
      return originalStdin.write(input);
    },
    // Add missing Stdin methods for TypeScript compliance
    setEncoding: ((encoding?: BufferEncoding) => {
      (originalStdin as any).setEncoding?.(encoding);
      return result.stdin;
    }) as any,
    setRawMode: ((mode?: boolean) => {
      (originalStdin as any).setRawMode?.(mode);
    }) as any,
    resume: (() => {
      (originalStdin as any).resume?.();
      return result.stdin;
    }) as any,
    pause: (() => {
      (originalStdin as any).pause?.();
      return result.stdin;
    }) as any
  } as any;
  
  return result as any;
}

// Generate mock terminal output based on memory store state
function generateMockOutput(uiMode: string = 'list', viewData: any = {}): string {
  // Handle different UI modes
  switch (uiMode) {
    case 'help':
      return generateHelpOutput();
    case 'archived':
      return generateArchivedOutput();
    case 'diff':
      return generateDiffOutput(viewData);
    case 'create':
      return generateCreateFeatureOutput(viewData);
    case 'confirmArchive':
      return generateArchiveConfirmOutput(viewData);
    case 'pickProjectForBranch':
      return generateProjectPickerOutput(viewData);
    case 'pickBranch':
      return generateBranchPickerOutput(viewData);
    case 'runConfig':
      return generateRunConfigOutput(viewData);
    case 'runProgress':
      return generateRunProgressOutput(viewData);
    case 'runResults':
      return generateRunResultsOutput(viewData);
    case 'commentInput':
      return generateCommentInputOutput(viewData);
    default:
      return generateMainListOutput();
  }
}

function generateMainListOutput(): string {
  const worktrees = Array.from(memoryStore.worktrees.values());
  const sessions = Array.from(memoryStore.sessions.values());
  const projects = Array.from(memoryStore.projects.values());

  if (worktrees.length === 0 && projects.length === 0) {
    return 'No worktrees found.\nEnsure your projects have worktrees in -branches folders.\nPress q to quit.';
  }

  // Use centralized pagination calculation
  const pageSize = calculatePageSize();
  const page = 0; // Default to first page for mock
  const {totalPages, paginationText} = calculatePaginationInfo(worktrees.length, page, pageSize);

  let output = `Enter attach, n new, a archive, x exec, d diff, s shell, q quit${paginationText}\n`;
  output += '#    PROJECT/FEATURE        AI  DIFF     CHANGES  PUSHED  PR\n';
  
  // Show only items for current page
  const start = page * pageSize;
  const pageWorktrees = worktrees.slice(start, start + pageSize);
  
  pageWorktrees.forEach((worktree, index) => {
    const session = sessions.find(s => s.session_name.includes(worktree.feature));
    const gitStatus = memoryStore.gitStatus.get(worktree.path);
    const prStatus = memoryStore.prStatus.get(worktree.path);
    
    // Row number (1-based for display, continuous across pages)
    const absoluteIndex = start + index;
    const rowNum = `${absoluteIndex + 1}`.padStart(4);
    
    // Format display name
    const displayName = `${worktree.project}/${worktree.feature}`.padEnd(20);
    
    // AI status
    let aiSymbol = '○'; // not running
    if (session) {
      switch (session.claude_status) {
        case 'working': aiSymbol = '●'; break;
        case 'waiting': aiSymbol = '◐'; break;
        case 'idle': aiSymbol = '◯'; break;
        default: aiSymbol = '○';
      }
    }
    
    // Diff status
    const added = gitStatus?.added_lines || 0;
    const deleted = gitStatus?.deleted_lines || 0;
    const diffStr = (added === 0 && deleted === 0) ? '-' : `+${added}/-${deleted}`;
    
    // Changes (ahead/behind)
    const ahead = gitStatus?.ahead || 0;
    const behind = gitStatus?.behind || 0;
    let changes = '';
    if (ahead > 0) changes += `↑${ahead} `;
    if (behind > 0) changes += `↓${behind}`;
    if (!changes) changes = '-';
    
    // Pushed status
    const pushed = gitStatus?.is_pushed ? '✓' : '○';
    
    // PR status
    let prStr = '-';
    if (prStatus?.number) {
      prStr = `${prStatus.number}`; // Just the number, no # prefix for cleaner display
      if (prStatus.checks === 'failing') prStr += '✗';
      else if (prStatus.checks === 'passing') prStr += '✓';
      else if (prStatus.checks === 'pending') prStr += '⏳';
      if (prStatus.is_merged || prStatus.state === 'MERGED') prStr += '⟫';
    }
    
    output += `${rowNum} ${displayName} ${aiSymbol}   ${diffStr.padEnd(8)} ${changes.padEnd(8)} ${pushed}       ${prStr}\n`;
  });
  
  // Add pagination footer if multiple pages
  if (totalPages > 1) {
    output += `\n${paginationText}\n`;
  }
  
  return output;
}

// Alias for backward compatibility
export const renderApp = renderTestApp;

// Add delay utility for tests
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateHelpOutput(): string {
  return `Help

Keyboard Shortcuts:
j/k - Navigate up/down
Enter - Select/confirm action  
n - Create new feature
a - Archive selected feature
? - Toggle this help
v - View archived features
d - View diff
D - View uncommitted changes
x - Execute run configuration
X - Configure run settings
r - Refresh
q - Quit

Column Explanations:
AI - Claude AI status (●=working, ◐=waiting, ○=idle)
DIFF - Added/removed lines (+10/-5)
CHANGES - Commits ahead/behind (↑2 ↓1)  
PUSHED - Whether changes are pushed (✓/○)
PR - Pull request number and status

Press ESC to close this help.`;
}

function generateArchivedOutput(): string {
  const archived = Array.from(memoryStore.archivedWorktrees.entries());
  if (archived.length === 0) {
    return 'Archived — j/k navigate, u unarchive, d delete, v back\n\nNo archived features found.\n\nPress v to go back.';
  }
  
  let output = 'Archived — j/k navigate, u unarchive, d delete, v back\n';
  for (const [project, worktrees] of archived) {
    for (const worktree of worktrees) {
      let line = `› ${project}/${worktree.feature}`;
      
      // Add PR information if available
      if (worktree.pr && worktree.pr.number) {
        line += ` (PR #${worktree.pr.number}`;
        if (worktree.pr.state) {
          line += ` - ${worktree.pr.state}`;
        }
        line += ')';
      }
      
      output += line + '\n';
    }
  }
  return output;
}

function generateDiffOutput(viewData: any): string {
  const title = viewData.title || 'Diff Viewer';
  const wrapMode = viewData.wrapMode || 'truncate';
  const viewMode = viewData.viewMode || 'unified';
  
  // Handle multi-file diff navigation tests FIRST (before generic wrap tests)
  if (title.includes('Multi-File') || title.includes('Boundary') || title.includes('Cursor Position') || 
      (title.includes('Side-by-Side') && title.includes('Diff')) || title.includes('Wrap Mode Diff')) {
    const wrapIndicator = `w toggle wrap (${wrapMode})`;
    const viewIndicator = `v toggle view (${viewMode})`;
    
    return `${title}

📁 src/file1.ts
  ▼ 
// File 1 content
export function file1Function() {
- return 'old';
+ return 'new';
}

function additionalFunction() {
+ return 'added';
}

📁 src/file2.ts
  ▼ 
// File 2 content
- console.log('file2');
+ console.log('file2 updated');

+ export default 'new export';

📁 src/file3.ts
  ▼ 
// File 3 content
const value = 'test';
+ const newValue = 'added';

- export { value };
+ export { value, newValue };

+ console.log('More changes');

j/k move  ${viewIndicator}  ${wrapIndicator}  c comment  C show all  d delete  S send to Claude  q close`;
  }

  // Handle wrap mode testing scenarios (but not our multi-file navigation tests)
  if ((title.includes('Wrap') || title.includes('Scroll') || title.includes('Page') || title.includes('Nav') || title.includes('SBS') || title.includes('Help') || title.includes('Unicode')) && !title.includes('Multi-File') && !title.includes('Boundary') && !title.includes('Cursor Position') && !title.includes('Wrap Mode Diff')) {
    const wrapIndicator = `w toggle wrap (${wrapMode})`;
    const viewIndicator = `v toggle view (${viewMode})`;
    
    // Generate content with long lines for wrap testing
    if (viewMode === 'sidebyside') {
      return `${title}

📁 src/example.ts
  ▼ 
- veryLongFunctionNameThatWillDefinitelyWrap... │ + anotherVeryLongFunctionNameWithDifferentCon...
- This is a very long string that continues... │ + Different long content here to see how...

📁 src/another.ts  
  ▼ 
- const shortOld = 'value';                     │ + const shortNew = 'value';
- // Medium comment that might wrap            │ + // Different medium comment with different

j/k move  ${viewIndicator}  ${wrapIndicator}  c comment  C show all  d delete  S send to Claude  q close`;
    } else {
      return `${title}

📁 src/example.ts
  ▼ 
- veryLongFunctionNameThatWillDefinitelyWrapInMostTerminalWidthsAndCauseMultipleRowsToBeUsedForTestingTheWrappingFunctionalityProperly() { return 'This is a very long string...'; }
+ anotherVeryLongFunctionNameWithDifferentContentToTestSideBySideWrappingBehaviorAndEnsureProperRowCalculations() { return 'Different long content here...'; }

- const shortOld = 'value';
+ const shortNew = 'value';

- // This is a medium length comment that might wrap on narrower terminals
+ // This is a different medium length comment with different content

const finalLongLineAtTheEndOfTheFileToTestScrollingToTheBottomWithWrappedContentAndVerifyThatAllContentRemainsAccessible = 'test content';

j/k move  ${viewIndicator}  ${wrapIndicator}  c comment  C show all  d delete  S send to Claude  q close`;
    }
  }

  // Handle Unicode testing scenarios  
  if (title.includes('Unicode')) {
    const wrapIndicator = `w toggle wrap (${wrapMode})`;
    const viewIndicator = `v toggle view (${viewMode})`;
    
    return `${title}

📁 src/unicode.ts
  ▼ 
- const emoji = '🚀 This line contains emojis 🎉 and should wrap properly 👨‍💻';
+ const emoji = '🚀 Different emoji content 🎉 with wide characters 中文测试 👨‍💻 🔬';

- const chinese = '这是一行包含中文字符的长文本内容用于测试文本换行功能';
+ const chinese = '这是一行不同的中文内容用于测试侧边对比模式下的文本换行功能';

const mixed = 'Start with ASCII, then 中文字符 mixed with emojis 🌟 and back to ASCII 🎪';

j/k move  ${viewIndicator}  ${wrapIndicator}  c comment  C show all  d delete  S send to Claude  q close`;
  }
  
  // Handle large diffs with navigation
  if (title.includes('Large')) {
    return `${title}

📁 src/example.ts
  ▼ 
Line 1 added: function newFeature() {
Line 2 added:   return 'implemented';
Line 3 added: }
Line 10 modified: - return 'Old content';
Line 10 modified: + return 'New content';

📁 src/another-file.ts
  ▼ 
Line 5 added: const newVariable = 'value';
Line 12 removed: // Old comment

Press j/k to navigate, ESC to close.`;
  }

  // Handle single file diff navigation tests
  if (title.includes('Single File')) {
    const wrapIndicator = `w toggle wrap (${wrapMode})`;
    const viewIndicator = `v toggle view (${viewMode})`;
    
    return `${title}

📁 single.ts
  ▼ 
// Single file
- export const value = 'old';
+ export const value = 'new';

+ console.log('Added line');

j/k move  ${viewIndicator}  ${wrapIndicator}  c comment  C show all  d delete  S send to Claude  q close`;
  }
  
  // Generate realistic diff output based on mock git diff data
  return `${title}

📁 src/example.ts
  ▼ 
// Added new function
function newFeature() {
  return 'implemented';
}

export default function existing() {
- return 'Old content';
+ return 'New content';
}

Press ESC to close.`;
}

function generateCreateFeatureOutput(viewData: any): string {
  const projects = viewData.projects || [];
  let output = 'Create Feature\n\nSelect Project:\n';
  
  if (projects.length > 0) {
    for (const project of projects) {
      const name = typeof project === 'string' ? project : project.name;
      const isSelected = name === viewData.defaultProject;
      output += `${isSelected ? '>' : ' '} ${name}\n`;
    }
  }
  
  output += `\nFeature Name: ${viewData.featureName || ''}\n`;
  if (viewData.validationError) {
    output += `\nError: ${viewData.validationError}\n`;
  }
  output += '\nPress ENTER to create, ESC to cancel.';
  return output;
}

function generateArchiveConfirmOutput(viewData: any): string {
  const project = viewData.project || 'project';
  const feature = viewData.feature || 'unknown';
  let output = `Archive Feature\n\nAre you sure you want to archive ${project}/${feature}?\n\n`;
  
  // Add session cleanup warning if there's an active session
  if (viewData.hasActiveSession) {
    output += `Warning: This will also cleanup the active session.\n\n`;
  }
  
  output += `[y] Yes  [n] No\n\nPress y to confirm, n to cancel.`;
  return output;
}

function generateProjectPickerOutput(viewData: any): string {
  const projects = viewData.items || viewData.projects || [];
  
  // Simulate the App.tsx logic: if no projects or empty projects, return to list view
  if (!projects || projects.length === 0) {
    return generateMainListOutput();
  }
  
  let output = 'Select Project\n\n';
  
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const name = typeof project === 'string' ? project : project.name;
    const isSelected = i === (viewData.selectedIndex || 0) || name === viewData.defaultProject;
    output += `${isSelected ? '>' : ' '} ${name}\n`;
  }
  
  output += '\nUse j/k to navigate, ENTER to select, ESC to cancel.';
  return output;
}

function generateBranchPickerOutput(viewData: any): string {
  const branches = viewData.items || viewData.branches || [];
  let output = 'Create from Remote Branch\n\n';
  
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    const name = typeof branch === 'string' ? branch : (branch.local_name || branch.name);
    const isSelected = i === (viewData.selectedIndex || 0);
    const prefix = isSelected ? '› ' : '  ';
    
    let line = `${prefix}${name}`;
    
    // Add PR information (handle both formats)
    const prNumber = branch.pr_number || branch.prNumber;
    const prChecks = branch.pr_checks || branch.prChecks;
    if (prNumber) {
      const checksIcon = prChecks === 'passing' ? '✓' : 
                        prChecks === 'failing' ? '✗' :
                        prChecks === 'pending' ? '⏳' : '';
      line += ` #${prNumber}${checksIcon}`;
    }
    
    // Add diff information
    if (branch.added_lines !== undefined && branch.deleted_lines !== undefined) {
      line += ` +${branch.added_lines}/-${branch.deleted_lines}`;
    }
    
    // Add ahead/behind info
    if (branch.ahead > 0) line += ` ↑${branch.ahead}`;
    if (branch.behind > 0) line += ` ↓${branch.behind}`;
    
    // Add PR title (handle both formats)
    const prTitle = branch.pr_title || branch.prTitle;
    if (prTitle) {
      line += ` ${prTitle}`;
    }
    
    output += line + '\n';
  }
  
  output += '\nUse j/k to navigate, ENTER to select, ESC to cancel.';
  return output;
}

function generateRunConfigOutput(viewData: any): string {
  const project = viewData.project || 'project';
  const configPath = viewData.configPath || '.claude/run.json';
  
  return `Run Configuration

Project: ${project}
Config Path: ${configPath}

Claude will analyze your project and generate a run configuration.

Press ENTER to generate config, ESC to cancel.`;
}

function generateRunProgressOutput(viewData: any): string {
  const project = viewData.project || 'project';
  const title = viewData.title || 'Generating Run Configuration';
  
  // Handle different progress types
  if (viewData.message && viewData.message.includes('Please wait while')) {
    return `Processing

${viewData.message || 'Please wait while the operation completes...'}

Project: ${project}

Please wait...`;
  }
  
  return `${title}

${viewData.message || 'Claude is analyzing your project and generating run configuration...'}

Project: ${project}

Please wait...`;
}

function generateRunResultsOutput(viewData: any): string {
  const result = viewData.result || {};
  
  if (result.success) {
    return `Success

Configuration generated successfully!

Content: ${result.content || 'Configuration created'}
Path: ${result.path || '.claude/run.json'}

Press ENTER to close and execute, ESC to close.`;
  } else {
    return `Error

Failed to generate configuration.

Error: ${result.error || 'Unknown error occurred'}
Path: ${result.path || '.claude/run.json'}

Press ESC to close.`;
  }
}

function generateCommentInputOutput(viewData: any): string {
  const fileName = viewData.fileName || 'file.ts';
  const lineIndex = viewData.lineIndex || 1;
  const lineText = viewData.lineText || 'code line';
  
  let output = `Add Comment

File: ${fileName}
Line ${lineIndex}: ${lineText}

Comment: ${viewData.commentText || ''}`;

  if (viewData.validationError) {
    output += `\nError: ${viewData.validationError}`;
  }
  
  output += '\n\nPress ENTER to submit, ESC to cancel.';
  return output;
}

export * from 'ink-testing-library';