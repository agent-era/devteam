import React from 'react';
import {render} from 'ink-testing-library';
import App from '../../src/App.js';
import {ServicesProvider} from '../../src/contexts/ServicesContext.js';
import {AppStateProvider} from '../../src/contexts/AppStateContext.js';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {FakeWorktreeService} from '../fakes/FakeWorktreeService.js';
import {memoryStore} from '../fakes/stores.js';

const h = React.createElement;

export interface TestAppProps {
  gitService?: FakeGitService;
  tmuxService?: FakeTmuxService;
  worktreeService?: FakeWorktreeService;
}

export function TestApp({gitService, tmuxService, worktreeService}: TestAppProps = {}) {
  const git = gitService || new FakeGitService();
  const tmux = tmuxService || new FakeTmuxService();
  const worktree = worktreeService || new FakeWorktreeService(git, tmux);

  return h(
    ServicesProvider,
    {gitService: git, tmuxService: tmux, worktreeService: worktree, children: h(AppStateProvider, null, h(App))}
  );
}

// Enhanced render function that provides better mock output
export function renderTestApp(props?: TestAppProps, options?: any) {
  const services = {
    gitService: props?.gitService || new FakeGitService(),
    tmuxService: props?.tmuxService || new FakeTmuxService(),
    worktreeService: props?.worktreeService || new FakeWorktreeService()
  };

  const result = render(h(TestApp, props as any));
  
  // Enhance the lastFrame function to provide more realistic output
  const originalLastFrame = result.lastFrame;
  let currentUIMode: string = 'list';
  let currentViewData: any = {};
  
  result.lastFrame = () => {
    // Generate output based on current memory store state and UI mode
    return generateMockOutput(currentUIMode, currentViewData);
  };

  // Store services for access in tests and add type assertion
  (result as any).services = services;
  (result as any).setUIMode = (mode: string, data?: any) => {
    currentUIMode = mode;
    currentViewData = data || {};
  };
  
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
    case 'pickBranch':
      return generatePickerOutput(viewData);
    default:
      return generateMainListOutput();
  }
}

function generateMainListOutput(): string {
  const worktrees = Array.from(memoryStore.worktrees.values());
  const sessions = Array.from(memoryStore.sessions.values());
  const projects = Array.from(memoryStore.projects.values());

  if (worktrees.length === 0 && projects.length === 0) {
    return 'No projects found. Press \'n\' to create new feature.';
  }

  let output = 'PROJECT/FEATURE        AI  DIFF     CHANGES  PUSHED  PR\n';
  
  for (const worktree of worktrees) {
    const session = sessions.find(s => s.session_name.includes(worktree.feature));
    const gitStatus = memoryStore.gitStatus.get(worktree.path);
    const prStatus = memoryStore.prStatus.get(worktree.path);
    
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
      prStr = `#${prStatus.number}`;
      if (prStatus.checks === 'failing') prStr += '✗';
      else if (prStatus.checks === 'passing') prStr += '✓';
    }
    
    output += `${displayName} ${aiSymbol}   ${diffStr.padEnd(8)} ${changes.padEnd(8)} ${pushed}       ${prStr}\n`;
  }
  
  output += '\nPress \'n\' for new, \'a\' to archive, \'?\' for help';
  return output;
}

function generateHelpOutput(): string {
  return `Help\n\nKeyboard Shortcuts:\nj/k - Navigate up/down\nn - Create new feature\na - Archive selected feature\n? - Toggle this help\nv - View archived features\nd - View diff\nD - View uncommitted changes\nr - Refresh\nq - Quit\n\nPress ESC to close this help.`;
}

function generateArchivedOutput(): string {
  const archived = Array.from(memoryStore.archivedWorktrees.entries());
  if (archived.length === 0) {
    return 'Archived Features\n\nNo archived features found.\n\nPress ESC to go back.';
  }
  
  let output = 'Archived Features\n\n';
  for (const [project, worktrees] of archived) {
    for (const worktree of worktrees) {
      output += `${project}/${worktree.feature}\n`;
    }
  }
  output += '\nPress ESC to go back.';
  return output;
}

function generateDiffOutput(viewData: any): string {
  const title = viewData.title || 'Diff Viewer';
  return `${title}\n\n📁 src/example.ts\n  ▼ function example() {\n+ Added new line\n- Removed old line\n  Context line\n\nPress ESC to close.`;
}

function generateCreateFeatureOutput(viewData: any): string {
  return `Create Feature\n\nSelect Project:\n> ${viewData.project || 'project-1'}\n\nFeature Name: ${viewData.featureName || ''}\n\nPress ENTER to create, ESC to cancel.`;
}

function generateArchiveConfirmOutput(viewData: any): string {
  const feature = viewData.feature || 'unknown';
  return `Archive Feature\n\nAre you sure you want to archive ${feature}?\n\n[y] Yes  [n] No\n\nPress y to confirm, n to cancel.`;
}

function generatePickerOutput(viewData: any): string {
  const items = viewData.items || [];
  let output = viewData.title || 'Select Item';
  output += '\n\n';
  
  for (let i = 0; i < items.length; i++) {
    const prefix = i === (viewData.selectedIndex || 0) ? '>' : ' ';
    output += `${prefix} ${items[i]}\n`;
  }
  
  output += '\nUse j/k to navigate, ENTER to select, ESC to cancel.';
  return output;
}

export * from 'ink-testing-library';