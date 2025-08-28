import React from 'react';
import {render} from 'ink-testing-library';
import App from '../../src/App.js';
import {ServicesProvider} from '../../src/contexts/ServicesContext.js';
import {AppStateProvider} from '../../src/contexts/AppStateContext.js';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {FakeWorktreeService} from '../fakes/FakeWorktreeService.js';
import {memoryStore} from '../fakes/stores.js';
import {calculatePageSize, calculatePaginationInfo} from '../../src/utils/pagination.js';

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
  result.lastFrame = () => {
    // Generate output based on current memory store state
    return generateMockOutput();
  };

  // Store services for access in tests and add type assertion
  (result as any).services = services;
  
  return result as any;
}

// Generate mock terminal output based on memory store state
function generateMockOutput(): string {
  const worktrees = Array.from(memoryStore.worktrees.values());
  const sessions = Array.from(memoryStore.sessions.values());
  const projects = Array.from(memoryStore.projects.values());

  if (worktrees.length === 0 && projects.length === 0) {
    return 'No worktrees found.\nEnsure your projects live under ~/projects and have worktrees in -branches folders.\nPress q to quit.';
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
      prStr = `#${prStatus.number}`;
      if (prStatus.checks === 'failing') prStr += '✗';
      else if (prStatus.checks === 'passing') prStr += '✓';
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

export * from 'ink-testing-library';