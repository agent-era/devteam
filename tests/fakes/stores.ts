import {ProjectInfo, WorktreeInfo, GitStatus, PRStatus, SessionInfo} from '../../src/models.js';

export interface MemoryStore {
  projects: Map<string, ProjectInfo>;
  worktrees: Map<string, WorktreeInfo>;
  gitStatus: Map<string, GitStatus>;
  prStatus: Map<string, PRStatus>;
  sessions: Map<string, SessionInfo>;
  remoteBranches: Map<string, Array<{
    local_name: string;
    remote_name: string;
    pr_number?: number;
    pr_state?: string;
    pr_checks?: string;
    pr_title?: string;
  }>>;
  archivedWorktrees: Map<string, WorktreeInfo[]>;
  
  reset(): void;
}

class InMemoryStore implements MemoryStore {
  projects = new Map<string, ProjectInfo>();
  worktrees = new Map<string, WorktreeInfo>();
  gitStatus = new Map<string, GitStatus>();
  prStatus = new Map<string, PRStatus>();
  sessions = new Map<string, SessionInfo>();
  remoteBranches = new Map<string, Array<{
    local_name: string;
    remote_name: string;
    pr_number?: number;
    pr_state?: string;
    pr_checks?: string;
    pr_title?: string;
  }>>();
  archivedWorktrees = new Map<string, WorktreeInfo[]>();

  reset() {
    this.projects.clear();
    this.worktrees.clear();
    this.gitStatus.clear();
    this.prStatus.clear();
    this.sessions.clear();
    this.remoteBranches.clear();
    this.archivedWorktrees.clear();
  }
}

// Global singleton store for tests
export const memoryStore = new InMemoryStore();

// Helper functions to set up test data
export function setupTestProject(name: string, path?: string): ProjectInfo {
  const project = new ProjectInfo({
    name,
    path: path || `/fake/projects/${name}`,
  });
  memoryStore.projects.set(name, project);
  return project;
}

export function setupTestWorktree(
  project: string,
  feature: string,
  overrides: Partial<WorktreeInfo> = {}
): WorktreeInfo {
  const worktree = new WorktreeInfo({
    project,
    feature,
    path: `/fake/projects/${project}-branches/${feature}`,
    branch: `feature/${feature}`,
    git: new GitStatus(),
    session: new SessionInfo(),
    pr: new PRStatus(),
    ...overrides,
  });
  
  memoryStore.worktrees.set(worktree.path, worktree);
  return worktree;
}

export function setupTestSession(
  project: string,
  feature: string,
  claudeStatus: string = 'not_running'
): SessionInfo {
  const sessionName = `dev-${project}-${feature}`;
  const session = new SessionInfo({
    session_name: sessionName,
    attached: claudeStatus !== 'not_running',
    claude_status: claudeStatus,
  });
  
  memoryStore.sessions.set(sessionName, session);
  return session;
}

export function setupTestPRStatus(
  path: string,
  overrides: Partial<PRStatus> = {}
): PRStatus {
  const prStatus = new PRStatus({
    number: 123,
    state: 'OPEN',
    checks: 'passing',
    ...overrides,
  });
  
  memoryStore.prStatus.set(path, prStatus);
  return prStatus;
}

export function setupTestGitStatus(
  path: string,
  overrides: Partial<GitStatus> = {}
): GitStatus {
  const gitStatus = new GitStatus({
    has_changes: false,
    modified_files: 0,
    added_lines: 0,
    deleted_lines: 0,
    has_remote: true,
    ahead: 0,
    behind: 0,
    is_pushed: true,
    ...overrides,
  });
  
  memoryStore.gitStatus.set(path, gitStatus);
  return gitStatus;
}