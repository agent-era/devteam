import {
  memoryStore,
  setupTestProject,
  setupTestWorktree,
  setupTestSession,
  setupTestPRStatus,
  setupTestGitStatus,
} from '../fakes/stores.js';
import {WorktreeInfo, GitStatus, PRStatus, SessionInfo} from '../../src/models.js';

// Builder pattern for creating test scenarios
export class TestScenarioBuilder {
  private projects: string[] = [];
  private worktrees: Array<{
    project: string;
    feature: string;
    options?: WorktreeOptions;
  }> = [];

  withProject(name: string): TestScenarioBuilder {
    this.projects.push(name);
    return this;
  }

  withWorktree(project: string, feature: string, options?: WorktreeOptions): TestScenarioBuilder {
    this.worktrees.push({project, feature, options});
    return this;
  }

  build(): TestScenario {
    // Setup projects
    const projectEntities = this.projects.map(name => setupTestProject(name));
    
    // Setup worktrees
    const worktreeEntities = this.worktrees.map(({project, feature, options}) => {
      const worktree = setupTestWorktree(project, feature);
      
      if (options?.claudeStatus) {
        const session = setupTestSession(project, feature, options.claudeStatus);
        worktree.session = session;
      }
      
      if (options?.git) {
        const gitStatus = setupTestGitStatus(worktree.path, options.git);
        worktree.git = gitStatus;
      }
      
      if (options?.pr) {
        const pr = setupTestPRStatus(worktree.path, options.pr);
        worktree.pr = pr;
      }
      
      memoryStore.worktrees.set(worktree.path, worktree);
      return worktree;
    });

    return {
      projects: projectEntities,
      worktrees: worktreeEntities,
    };
  }
}

interface WorktreeOptions {
  claudeStatus?: string;
  git?: Partial<GitStatus>;
  pr?: Partial<PRStatus>;
}

interface TestScenario {
  projects: any[];
  worktrees: WorktreeInfo[];
}

// Fluent API for creating test data
export function createTestScenario(): TestScenarioBuilder {
  return new TestScenarioBuilder();
}

// Common test scenarios as factory functions
export function createEmptyProject(name: string = 'empty-project') {
  return createTestScenario()
    .withProject(name)
    .build();
}

export function createProjectWithFeatures(project: string, features: string[]) {
  const builder = createTestScenario().withProject(project);
  
  features.forEach(feature => {
    builder.withWorktree(project, feature, {
      claudeStatus: 'idle',
      git: {has_changes: false, ahead: 0}
    });
  });
  
  return builder.build();
}

export function createActiveWorkSession(project: string, feature: string) {
  return createTestScenario()
    .withProject(project)
    .withWorktree(project, feature, {
      claudeStatus: 'working',
      git: {
        has_changes: true,
        modified_files: 3,
        added_lines: 45,
        deleted_lines: 12,
        ahead: 1
      }
    })
    .build();
}

export function createFeatureWithPR(project: string, feature: string, prNumber: number) {
  return createTestScenario()
    .withProject(project)
    .withWorktree(project, feature, {
      claudeStatus: 'waiting',
      git: {
        has_changes: false,
        has_remote: true,
        is_pushed: true,
        ahead: 2
      },
      pr: {
        number: prNumber,
        state: 'OPEN',
        checks: 'passing',
        title: `Implement ${feature}`
      }
    })
    .build();
}

export function createMergedFeature(project: string, feature: string, prNumber: number) {
  return createTestScenario()
    .withProject(project)
    .withWorktree(project, feature, {
      claudeStatus: 'idle',
      git: {
        has_changes: false,
        has_remote: true,
        is_pushed: true,
        ahead: 0
      },
      pr: {
        number: prNumber,
        state: 'MERGED',
        checks: 'passing',
        title: `Implement ${feature}`
      }
    })
    .build();
}

export function createComplexDevEnvironment() {
  return createTestScenario()
    .withProject('frontend')
    .withProject('backend')
    .withWorktree('frontend', 'user-auth', {
      claudeStatus: 'working',
      git: {has_changes: true, ahead: 2, added_lines: 89, deleted_lines: 23}
    })
    .withWorktree('frontend', 'dashboard', {
      claudeStatus: 'waiting',
      git: {has_changes: false, is_pushed: true, ahead: 3},
      pr: {number: 123, state: 'OPEN', checks: 'pending'}
    })
    .withWorktree('backend', 'api-refactor', {
      claudeStatus: 'idle',
      git: {has_changes: false, is_pushed: true, ahead: 1},
      pr: {number: 456, state: 'MERGED', checks: 'passing'}
    })
    .build();
}

// Helper for creating archived worktrees
export function createArchivedFeatures(project: string, features: string[]) {
  const archivedWorktrees = features.map(feature => new WorktreeInfo({
    project,
    feature,
    path: `/fake/projects/${project}-archived/archived-${Date.now()}_${feature}`,
    branch: `feature/${feature}`,
    is_archived: true,
    git: new GitStatus(),
    pr: new PRStatus(),
    session: new SessionInfo()
  }));
  
  memoryStore.archivedWorktrees.set(project, archivedWorktrees);
  return archivedWorktrees;
}

// Helper for creating remote branches for branch picker tests
export function createRemoteBranches(project: string, branches: string[]) {
  const remoteBranches = branches.map(branch => ({
    local_name: branch,
    remote_name: `origin/${branch}`,
    pr_number: undefined,
    pr_state: undefined,
    pr_checks: undefined,
    pr_title: undefined
  }));
  
  memoryStore.remoteBranches.set(project, remoteBranches);
  return remoteBranches;
}

// Assertions that are more readable
export function expectWorkingSession(project: string, feature: string) {
  const sessionName = `dev-${project}-${feature}`;
  const session = memoryStore.sessions.get(sessionName);
  
  if (!session) {
    throw new Error(`Expected active session for ${project}/${feature}, but none found`);
  }
  
  if (session.claude_status !== 'working') {
    throw new Error(`Expected session ${sessionName} to be 'working', but was '${session.claude_status}'`);
  }
  
  return session;
}

export function expectIdleSession(project: string, feature: string) {
  const sessionName = `dev-${project}-${feature}`;
  const session = memoryStore.sessions.get(sessionName);
  
  if (!session) {
    throw new Error(`Expected session for ${project}/${feature}, but none found`);
  }
  
  if (session.claude_status !== 'idle') {
    throw new Error(`Expected session ${sessionName} to be 'idle', but was '${session.claude_status}'`);
  }
  
  return session;
}

export function expectOpenPR(project: string, feature: string) {
  const worktree = Array.from(memoryStore.worktrees.values())
    .find(w => w.project === project && w.feature === feature);
  
  if (!worktree) {
    throw new Error(`Expected worktree ${project}/${feature}, but not found`);
  }
  
  const pr = memoryStore.prStatus.get(worktree.path);
  if (!pr) {
    throw new Error(`Expected PR for ${project}/${feature}, but none found`);
  }
  
  if (pr.state !== 'OPEN') {
    throw new Error(`Expected PR to be OPEN, but was ${pr.state}`);
  }
  
  return pr;
}

export function expectMergedPR(project: string, feature: string) {
  const worktree = Array.from(memoryStore.worktrees.values())
    .find(w => w.project === project && w.feature === feature);
  
  if (!worktree) {
    throw new Error(`Expected worktree ${project}/${feature}, but not found`);
  }
  
  const pr = memoryStore.prStatus.get(worktree.path);
  if (!pr) {
    throw new Error(`Expected PR for ${project}/${feature}, but none found`);
  }
  
  if (pr.state !== 'MERGED') {
    throw new Error(`Expected PR to be MERGED, but was ${pr.state}`);
  }
  
  return pr;
}