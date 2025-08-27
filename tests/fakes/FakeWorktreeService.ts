import {WorktreeService, WorktreeCreationResult, ArchiveResult} from '../../src/services/WorktreeService.js';
import {FakeGitService} from './FakeGitService.js';
import {FakeTmuxService} from './FakeTmuxService.js';
import {memoryStore} from './stores.js';
import {BASE_PATH, DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX} from '../../src/constants.js';

export class FakeWorktreeService extends WorktreeService {
  private fakeGitService: FakeGitService;
  private fakeTmuxService: FakeTmuxService;

  constructor(gitService?: FakeGitService, tmuxService?: FakeTmuxService) {
    const git = gitService || new FakeGitService();
    const tmux = tmuxService || new FakeTmuxService();
    super(git, tmux);
    this.fakeGitService = git;
    this.fakeTmuxService = tmux;
  }

  createFeature(projectName: string, featureName: string): WorktreeCreationResult {
    const created = this.fakeGitService.createWorktree(projectName, featureName);
    if (!created) return null;

    const worktreePath = `/fake/projects/${projectName}${DIR_BRANCHES_SUFFIX}/${featureName}`;
    
    // Simulate environment setup (no actual file operations)
    this.createTmuxSession(projectName, featureName, worktreePath);
    
    return {
      project: projectName,
      feature: featureName,
      path: worktreePath,
      branch: `feature/${featureName}`
    };
  }

  createWorktreeFromRemoteBranch(project: string, remoteBranch: string, localName: string): boolean {
    const created = this.fakeGitService.createWorktreeFromRemote(project, remoteBranch, localName);
    if (!created) return false;

    const worktreePath = `/fake/projects/${project}${DIR_BRANCHES_SUFFIX}/${localName}`;
    this.createTmuxSession(project, localName, worktreePath);
    
    return true;
  }

  archiveFeature(projectName: string, worktreePath: string, featureName: string): ArchiveResult {
    // Terminate sessions - manually do what terminateFeatureSessions would do
    const sessionName = this.fakeTmuxService.sessionName(projectName, featureName);
    const shellSessionName = this.fakeTmuxService.shellSessionName(projectName, featureName);
    
    this.fakeTmuxService.killSession(sessionName);
    this.fakeTmuxService.killSession(shellSessionName);
    
    // Move worktree from active to archived in memory
    const archived = this.fakeGitService.archiveWorktree(projectName, worktreePath, featureName);
    if (!archived) throw new Error('Failed to archive worktree');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivedPath = `/fake/projects/${projectName}${DIR_ARCHIVED_SUFFIX}/archived-${timestamp}_${featureName}`;
    
    return {archivedPath};
  }

  deleteArchived(pathToArchived: string): boolean {
    return this.fakeGitService.deleteArchived(pathToArchived);
  }

  attachOrCreateSession(project: string, feature: string, cwd: string): void {
    const sessionName = this.fakeTmuxService.sessionName(project, feature);
    const activeSessions = this.fakeTmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      this.createTmuxSession(project, feature, cwd);
    }
    
    // In real implementation, this would attach to tmux session
    // In fake, we just mark it as attached
    this.fakeTmuxService.updateClaudeStatus(sessionName, 'idle');
  }

  attachOrCreateShellSession(project: string, feature: string, cwd: string): void {
    const sessionName = this.fakeTmuxService.shellSessionName(project, feature);
    const activeSessions = this.fakeTmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      this.fakeTmuxService.createShellSession(project, feature);
    }
  }

  setupWorktreeEnvironment(projectName: string, worktreePath: string): void {
    // In the real implementation, this copies .env and Claude settings files
    // In the fake, we just simulate this operation
    // No actual file operations needed for testing
  }

  // Methods that simulate tmux operations - public to match base class
  createTmuxSession(project: string, feature: string, cwd: string): string {
    const sessionName = this.fakeTmuxService.createSession(project, feature, 'idle');
    
    // Simulate starting Claude in the session
    setTimeout(() => {
      this.fakeTmuxService.updateClaudeStatus(sessionName, 'idle');
    }, 100);
    
    return sessionName;
  }

  createShellSession(project: string, feature: string, cwd: string): string {
    return this.fakeTmuxService.createShellSession(project, feature);
  }


}