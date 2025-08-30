import {GitService} from '../../src/services/GitService.js';
import {GitStatus, ProjectInfo, PRStatus, WorktreeInfo} from '../../src/models.js';
import {memoryStore} from './stores.js';
import {DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX} from '../../src/constants.js';

export class FakeGitService extends GitService {
  constructor(basePath: string = '/tmp/test-projects') {
    super(basePath);
  }

  discoverProjects(): ProjectInfo[] {
    return Array.from(memoryStore.projects.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getWorktreesForProject(project: ProjectInfo): Promise<Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string; 
    mtime: number
  }>> {
    const worktrees = Array.from(memoryStore.worktrees.values())
      .filter(w => w.project === project.name)
      .map(w => ({
        project: w.project,
        feature: w.feature,
        path: w.path,
        branch: w.branch,
        mtime: w.mtime || Date.now(),
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    return worktrees;
  }

  async getGitStatus(worktreePath: string): Promise<GitStatus> {
    const stored = memoryStore.gitStatus.get(worktreePath);
    if (stored) {
      return stored;
    }
    
    // Return default GitStatus if none stored
    return new GitStatus({
      has_changes: false,
      modified_files: 0,
      added_lines: 0,
      deleted_lines: 0,
      has_remote: true,
      ahead: 0,
      behind: 0,
      is_pushed: true,
    });
  }

  createWorktree(project: string, featureName: string, branchName?: string): boolean {
    // Check if this operation should fail (for error testing)
    if ((global as any).__mockGitShouldFail) {
      return false;
    }

    const projectInfo = memoryStore.projects.get(project);
    if (!projectInfo) return false;

    const branchesDir = `/fake/projects/${project}${DIR_BRANCHES_SUFFIX}`;
    const worktreePath = `${branchesDir}/${featureName}`;
    const branch = branchName || `feature/${featureName}`;

    // Check if worktree already exists
    if (memoryStore.worktrees.has(worktreePath)) {
      return false;
    }

    // Create the worktree in memory
    const worktree = {
      project,
      feature: featureName,
      path: worktreePath,
      branch,
      git: new GitStatus(),
      session: {session_name: `dev-${project}-${featureName}`, attached: false, claude_status: 'not_running'},
      pr: new PRStatus(),
      mtime: Date.now(),
      last_commit_ts: Date.now() / 1000,
    };

    memoryStore.worktrees.set(worktreePath, worktree as any);
    
    // Create default git status
    memoryStore.gitStatus.set(worktreePath, new GitStatus({
      has_changes: false,
      modified_files: 0,
      has_remote: false, // New branch, no remote yet
      ahead: 1, // One commit ahead (initial commit)
      behind: 0,
      is_pushed: false,
    }));

    return true;
  }

  createWorktreeFromRemote(project: string, remoteBranch: string, localName: string): boolean {
    // Check for error simulation flag
    if ((global as any).__mockGitShouldFail) {
      return false;
    }

    const projectInfo = memoryStore.projects.get(project);
    if (!projectInfo) return false;

    const branchesDir = `/fake/projects/${project}${DIR_BRANCHES_SUFFIX}`;
    const worktreePath = `${branchesDir}/${localName}`;
    const localBranch = remoteBranch.startsWith('origin/') ? remoteBranch.slice(7) : remoteBranch;

    // Check if worktree already exists
    if (memoryStore.worktrees.has(worktreePath)) {
      return false;
    }

    // Create the worktree in memory
    const worktree = {
      project,
      feature: localName,
      path: worktreePath,
      branch: localBranch,
      git: new GitStatus(),
      session: {session_name: `dev-${project}-${localName}`, attached: false, claude_status: 'not_running'},
      pr: new PRStatus(),
      mtime: Date.now(),
      last_commit_ts: Date.now() / 1000,
    };

    memoryStore.worktrees.set(worktreePath, worktree as any);
    
    // Create git status for remote branch
    memoryStore.gitStatus.set(worktreePath, new GitStatus({
      has_changes: false,
      modified_files: 0,
      has_remote: true,
      ahead: 0,
      behind: 0,
      is_pushed: true,
    }));

    return true;
  }

  async getRemoteBranches(project: string): Promise<Array<Record<string, any>>> {
    const branches = memoryStore.remoteBranches.get(project) || [];
    return branches.map(branch => ({
      local_name: branch.local_name,
      remote_name: branch.remote_name,
      timestamp: Date.now() / 1000,
      pr_number: branch.pr_number,
      pr_state: branch.pr_state,
      pr_checks: branch.pr_checks,
      pr_title: branch.pr_title,
    }));
  }

  getArchivedForProject(project: ProjectInfo): Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string; 
    archived_date?: string; 
    is_archived: boolean; 
    mtime: number
  }> {
    const archived = memoryStore.archivedWorktrees.get(project.name) || [];
    return archived.map(w => ({
      project: w.project,
      feature: w.feature,
      path: w.path.replace(DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX),
      branch: w.branch,
      archived_date: new Date(w.mtime || Date.now()).toISOString(),
      is_archived: true,
      mtime: w.mtime || Date.now(),
    }));
  }

  batchFetchPRData(repoPath: string, opts: {includeChecks?: boolean; includeTitle?: boolean} = {}): Record<string, PRStatus> {
    // Return PR data from memory store for all branches
    const prByBranch: Record<string, PRStatus> = {};
    
    // Find all PR statuses for this project
    for (const [path, pr] of memoryStore.prStatus.entries()) {
      if (path.includes(repoPath.split('/').pop() || '')) {
        const worktree = memoryStore.worktrees.get(path);
        if (worktree) {
          prByBranch[worktree.branch] = pr;
        }
      }
    }
    
    return prByBranch;
  }

  async batchFetchPRDataAsync(repoPath: string, opts: {includeChecks?: boolean; includeTitle?: boolean} = {}): Promise<Record<string, PRStatus>> {
    // Just return the sync version for fake
    return this.batchFetchPRData(repoPath, opts);
  }

  batchGetPRStatusForWorktrees(
    worktrees: Array<{project: string; path: string; is_archived?: boolean}>, 
    includeChecks = true
  ): Record<string, PRStatus> {
    const result: Record<string, PRStatus> = {};
    
    for (const wt of worktrees) {
      const storedPR = memoryStore.prStatus.get(wt.path);
      result[wt.path] = storedPR || new PRStatus();
    }
    
    return result;
  }

  async batchGetPRStatusForWorktreesAsync(
    worktrees: Array<{project: string; path: string; is_archived?: boolean}>, 
    includeChecks = true
  ): Promise<Record<string, PRStatus>> {
    return this.batchGetPRStatusForWorktrees(worktrees, includeChecks);
  }

  // Archive a worktree (move from worktrees to archived)
  archiveWorktree(worktreePath: string): string {
    const worktree = memoryStore.worktrees.get(worktreePath);
    if (!worktree) throw new Error('Worktree not found');

    // Generate archived path
    const timestamp = Date.now();
    const archivedPath = worktreePath.replace(DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX).replace(worktree.feature, `archived-${timestamp}_${worktree.feature}`);
    
    // Remove from worktrees
    memoryStore.worktrees.delete(worktreePath);
    
    // Add to archived with updated path
    const archivedWorktree = new WorktreeInfo({
      ...worktree,
      path: archivedPath,
      is_archived: true
    });
    const archived = memoryStore.archivedWorktrees.get(worktree.project) || [];
    archived.push(archivedWorktree);
    memoryStore.archivedWorktrees.set(worktree.project, archived);

    return archivedPath;
  }

  // Delete an archived worktree permanently
  deleteArchived(archivedPath: string): boolean {
    // Check if deletion should fail (for error testing)
    if ((global as any).__mockGitShouldFail || (global as any).__mockDeleteShouldFail) {
      return false;
    }

    // Find and remove from archived worktrees
    for (const [project, archivedList] of memoryStore.archivedWorktrees.entries()) {
      const index = archivedList.findIndex(w => w.path === archivedPath || w.path.replace(DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX) === archivedPath);
      if (index >= 0) {
        archivedList.splice(index, 1);
        memoryStore.archivedWorktrees.set(project, archivedList);
        return true;
      }
    }
    return false;
  }
}