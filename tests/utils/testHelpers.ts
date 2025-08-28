import {
  memoryStore,
  setupTestProject,
  setupTestWorktree,
  setupTestSession,
  setupTestPRStatus,
  setupTestGitStatus,
} from '../fakes/stores.js';
export {memoryStore, setupTestProject, setupTestWorktree} from '../fakes/stores.js';
export * from './testDataFactories.js';
import {WorktreeInfo, GitStatus, PRStatus} from '../../src/models.js';

// Reset all test data before each test
export function resetTestData() {
  memoryStore.reset();
}

// Setup helpers for common test scenarios
export function setupBasicProject(projectName: string = 'test-project') {
  return setupTestProject(projectName);
}

export function setupProjectWithWorktrees(
  projectName: string = 'test-project',
  features: string[] = ['feature-1', 'feature-2']
) {
  const project = setupTestProject(projectName);
  const worktrees = features.map(feature => setupTestWorktree(projectName, feature));
  return {project, worktrees};
}

export function setupWorktreeWithSession(
  project: string,
  feature: string,
  claudeStatus: string = 'idle'
) {
  const worktree = setupTestWorktree(project, feature);
  const session = setupTestSession(project, feature, claudeStatus);
  
  // Link them together
  worktree.session = session;
  memoryStore.worktrees.set(worktree.path, worktree);
  
  return {worktree, session};
}

export function setupWorktreeWithPR(
  project: string,
  feature: string,
  prOverrides: Partial<PRStatus> = {}
) {
  const worktree = setupTestWorktree(project, feature);
  const pr = setupTestPRStatus(worktree.path, prOverrides);
  
  // Link them together
  worktree.pr = pr;
  memoryStore.worktrees.set(worktree.path, worktree);
  
  return {worktree, pr};
}

export function setupWorktreeWithGitStatus(
  project: string,
  feature: string,
  gitOverrides: Partial<GitStatus> = {}
) {
  const worktree = setupTestWorktree(project, feature);
  const gitStatus = setupTestGitStatus(worktree.path, gitOverrides);
  
  // Link them together
  worktree.git = gitStatus;
  memoryStore.worktrees.set(worktree.path, worktree);
  
  return {worktree, gitStatus};
}

export function setupFullWorktree(
  project: string,
  feature: string,
  options: {
    claudeStatus?: string;
    prOverrides?: Partial<PRStatus>;
    gitOverrides?: Partial<GitStatus>;
  } = {}
) {
  const worktree = setupTestWorktree(project, feature);
  
  if (options.claudeStatus) {
    const session = setupTestSession(project, feature, options.claudeStatus);
    worktree.session = session;
  }
  
  if (options.prOverrides) {
    const pr = setupTestPRStatus(worktree.path, options.prOverrides);
    worktree.pr = pr;
  }
  
  if (options.gitOverrides) {
    const gitStatus = setupTestGitStatus(worktree.path, options.gitOverrides);
    worktree.git = gitStatus;
  }
  
  memoryStore.worktrees.set(worktree.path, worktree);
  return worktree;
}

export function setupRemoteBranches(project: string, branches: Array<{
  local_name: string;
  remote_name: string;
  pr_number?: number;
  pr_state?: string;
  pr_checks?: string;
  pr_title?: string;
}>) {
  memoryStore.remoteBranches.set(project, branches);
}

// Assertion helpers
export function expectWorktreeInMemory(project: string, feature: string): WorktreeInfo {
  const worktrees = Array.from(memoryStore.worktrees.values());
  const worktree = worktrees.find(w => w.project === project && w.feature === feature);
  
  if (!worktree) {
    throw new Error(`Expected to find worktree ${project}/${feature} in memory, but it was not found`);
  }
  
  return worktree;
}

export function expectWorktreeNotInMemory(project: string, feature: string): void {
  const worktrees = Array.from(memoryStore.worktrees.values());
  const worktree = worktrees.find(w => w.project === project && w.feature === feature);
  
  if (worktree) {
    throw new Error(`Expected worktree ${project}/${feature} to not be in memory, but it was found`);
  }
}

export function expectSessionInMemory(sessionName: string) {
  const session = memoryStore.sessions.get(sessionName);
  
  if (!session) {
    throw new Error(`Expected to find session ${sessionName} in memory, but it was not found`);
  }
  
  return session;
}

export function expectSessionNotInMemory(sessionName: string) {
  const session = memoryStore.sessions.get(sessionName);
  
  if (session) {
    throw new Error(`Expected session ${sessionName} to not be in memory, but it was found`);
  }
}

export function expectArchivedWorktree(project: string, feature: string) {
  const archived = memoryStore.archivedWorktrees.get(project) || [];
  const archivedWorktree = archived.find(w => w.feature === feature);
  
  if (!archivedWorktree) {
    throw new Error(`Expected to find archived worktree ${project}/${feature}, but it was not found`);
  }
  
  return archivedWorktree;
}

// Utility to get all worktrees for a project from memory
export function getWorktreesFromMemory(project: string): WorktreeInfo[] {
  return Array.from(memoryStore.worktrees.values())
    .filter(w => w.project === project);
}

// Simulate time passing for refresh intervals
export function simulateTimeDelay(ms: number = 0): Promise<void> {
  if (jest.isMockFunction(setTimeout)) {
    // Using fake timers - advance time and resolve immediately
    jest.advanceTimersByTime(ms);
    return Promise.resolve();
  } else {
    // Using real timers - actual delay
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Mock stdin input helper
export function simulateKeyPress(key: string, special?: {
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  return?: boolean;
  escape?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
}) {
  return {
    input: special ? '' : key,
    key: {
      upArrow: special?.upArrow || false,
      downArrow: special?.downArrow || false,
      leftArrow: special?.leftArrow || false,
      rightArrow: special?.rightArrow || false,
      return: special?.return || false,
      escape: special?.escape || false,
      pageUp: special?.pageUp || false,
      pageDown: special?.pageDown || false,
    }
  };
}