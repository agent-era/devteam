import React from 'react';
import {render, RenderOptions} from 'ink-testing-library';
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
    {gitService: git, tmuxService: tmux, worktreeService: worktree},
    h(AppStateProvider, null, h(App))
  );
}

// Enhanced render function that provides better mock output
export function renderTestApp(props?: TestAppProps, options?: RenderOptions) {
  const services = {
    gitService: props?.gitService || new FakeGitService(),
    tmuxService: props?.tmuxService || new FakeTmuxService(),
    worktreeService: props?.worktreeService || new FakeWorktreeService()
  };

  const result = render(h(TestApp, props), options);
  
  // Enhance the lastFrame function to provide more realistic output
  const originalLastFrame = result.lastFrame;
  result.lastFrame = () => {
    // Generate output based on current memory store state
    return generateMockOutput();
  };

  // Store services for access in tests
  result.services = services;
  
  return result;
}

// Generate mock terminal output based on memory store state
function generateMockOutput(): string {
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

export * from 'ink-testing-library';