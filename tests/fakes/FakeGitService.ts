import {GitService} from '../../src/services/GitService.js';
import {GitStatus, ProjectInfo, PRStatus, WorktreeInfo, SessionInfo} from '../../src/models.js';
import {DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX} from '../../src/constants.js';
import {memoryStore} from './stores.js';

export class FakeGitService extends GitService {
  private projects = new Map<string, ProjectInfo>();
  private worktrees = new Map<string, WorktreeInfo>();
  private gitStatus = new Map<string, GitStatus>();
  private remoteBranches = new Map<string, Array<{ local_name: string; remote_name: string; pr_number?: number; pr_state?: string; pr_checks?: string; pr_title?: string }>>();
  private archivedWorktrees = new Map<string, WorktreeInfo[]>();

  constructor(basePath: string = '/tmp/test-projects') {
    super(basePath);
  }

  // Test seeding helpers
  addProject(name: string, path?: string): ProjectInfo {
    const p = new ProjectInfo({name, path: path || `/fake/projects/${name}`});
    this.projects.set(name, p);
    try { memoryStore.projects.set(name, p); } catch {}
    return p;
  }

  addWorktree(project: string, featureName: string, overrides: Partial<WorktreeInfo> = {}): WorktreeInfo {
    const branchesDir = `/fake/projects/${project}${DIR_BRANCHES_SUFFIX}`;
    const worktreePath = `${branchesDir}/${featureName}`;
    const wt = new WorktreeInfo({
      project,
      feature: featureName,
      path: worktreePath,
      branch: overrides.branch || `feature/${featureName}`,
      git: new GitStatus(),
      session: new SessionInfo({session_name: `dev-${project}-${featureName}`, attached: false, claude_status: 'not_running'}),
      pr: new PRStatus(),
      ...overrides,
    });
    this.worktrees.set(worktreePath, wt);
    try { memoryStore.worktrees.set(worktreePath, wt); } catch {}
    return wt;
  }

  setGitStatus(path: string, partial: Partial<GitStatus>): void {
    const status = new GitStatus({
      has_changes: false,
      modified_files: 0,
      added_lines: 0,
      deleted_lines: 0,
      has_remote: true,
      ahead: 0,
      behind: 0,
      is_pushed: true,
      ...partial,
    });
    this.gitStatus.set(path, status);
    try { memoryStore.gitStatus.set(path, status); } catch {}
  }

  setRemoteBranches(project: string, branches: Array<{local_name: string; remote_name: string; pr_number?: number; pr_state?: string; pr_checks?: string; pr_title?: string;}>): void {
    this.remoteBranches.set(project, branches);
    try { memoryStore.remoteBranches.set(project, branches as any); } catch {}
  }

  discoverProjects(): ProjectInfo[] {
    const merged = new Map<string, ProjectInfo>([...this.projects, ...memoryStore.projects]);
    return Array.from(merged.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getWorktreesForProject(project: ProjectInfo): Promise<Array<{
    project: string;
    feature: string;
    path: string;
    branch: string;
    mtime: number;
    last_commit_ts: number;
  }>> {
    const merged = new Map<string, WorktreeInfo>([...this.worktrees, ...memoryStore.worktrees]);
    const worktrees = Array.from(merged.values())
      .filter(w => w.project === project.name)
      .map(w => ({
        project: w.project,
        feature: w.feature,
        path: w.path,
        branch: w.branch,
        mtime: w.mtime || Date.now(),
        last_commit_ts: (w.last_commit_ts as any) || 0,
      }))
      .sort((a, b) => {
        const d = (b.last_commit_ts || 0) - (a.last_commit_ts || 0);
        if (d !== 0) return d;
        return a.feature.localeCompare(b.feature);
      });

    return worktrees;
  }

  async getGitStatus(worktreePath: string): Promise<GitStatus> {
    const stored = this.gitStatus.get(worktreePath) || memoryStore.gitStatus.get(worktreePath);
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

  createProject(projectName: string): void {
    if (!this.projects.has(projectName)) {
      const proj = new ProjectInfo({
        name: projectName,
        path: `/fake/projects/${projectName}`,
      });
      this.projects.set(projectName, proj);
      try { memoryStore.projects.set(projectName, proj); } catch {}
    }
  }

  createWorktree(project: string, featureName: string, branchName?: string): boolean {
    // Check if this operation should fail (for error testing)
    if ((global as any).__mockGitShouldFail) {
      return false;
    }

    const projectInfo = this.projects.get(project) || memoryStore.projects.get(project);
    if (!projectInfo) return false;

    const branchesDir = `/fake/projects/${project}${DIR_BRANCHES_SUFFIX}`;
    const worktreePath = `${branchesDir}/${featureName}`;
    const branch = branchName || featureName;

    // Check if worktree already exists
    if (this.worktrees.has(worktreePath) || memoryStore.worktrees.has(worktreePath)) {
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

    this.worktrees.set(worktreePath, worktree as any);
    try { memoryStore.worktrees.set(worktreePath, worktree as any); } catch {}
    
    // Create default git status
    const status = new GitStatus({
      has_changes: false,
      modified_files: 0,
      has_remote: false, // New branch, no remote yet
      ahead: 1, // One commit ahead (initial commit)
      behind: 0,
      is_pushed: false,
    });
    this.gitStatus.set(worktreePath, status);
    try { memoryStore.gitStatus.set(worktreePath, status); } catch {}

    return true;
  }

  createWorktreeFromRemote(project: string, remoteBranch: string, localName: string): boolean {
    // Check for error simulation flag
    if ((global as any).__mockGitShouldFail) {
      return false;
    }

    const projectInfo = this.projects.get(project) || memoryStore.projects.get(project);
    if (!projectInfo) return false;

    const branchesDir = `/fake/projects/${project}${DIR_BRANCHES_SUFFIX}`;
    const worktreePath = `${branchesDir}/${localName}`;
    const localBranch = remoteBranch.startsWith('origin/') ? remoteBranch.slice(7) : remoteBranch;

    // Check if worktree already exists
    if (this.worktrees.has(worktreePath) || memoryStore.worktrees.has(worktreePath)) {
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

    this.worktrees.set(worktreePath, worktree as any);
    try { memoryStore.worktrees.set(worktreePath, worktree as any); } catch {}
    
    // Create git status for remote branch
    const status2 = new GitStatus({
      has_changes: false,
      modified_files: 0,
      has_remote: true,
      ahead: 0,
      behind: 0,
      is_pushed: true,
    });
    this.gitStatus.set(worktreePath, status2);
    try { memoryStore.gitStatus.set(worktreePath, status2); } catch {}

    return true;
  }

  async getRemoteBranches(project: string): Promise<Array<{
    local_name: string;
    remote_name: string;
    pr_number?: number;
    pr_state?: string;
    pr_checks?: string;
    pr_title?: string;
  }>> {
    const mergedBranches = (this.remoteBranches.get(project) || []).slice();
    const extra = memoryStore.remoteBranches.get(project) || [];
    for (const b of extra) mergedBranches.push(b as any);
    const branches = mergedBranches;
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
    const dedup = new Map<string, WorktreeInfo>();
    for (const w of this.archivedWorktrees.get(project.name) || []) dedup.set(w.path, w);
    for (const w of memoryStore.archivedWorktrees.get(project.name) || []) dedup.set(w.path, w);
    const archived = Array.from(dedup.values());
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
    for (const [path, pr] of (memoryStore.prStatus as any as Map<string, PRStatus>).entries()) {
      if (path.includes(repoPath.split('/').pop() || '')) {
        const worktree = this.worktrees.get(path);
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
    const worktree = this.worktrees.get(worktreePath) || memoryStore.worktrees.get(worktreePath);
    if (!worktree) throw new Error('Worktree not found');

    // Generate archived path
    const timestamp = Date.now();
    const archivedPath = worktreePath.replace(DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX).replace(worktree.feature, `archived-${timestamp}_${worktree.feature}`);
    
    // Remove from worktrees
    this.worktrees.delete(worktreePath);
    try { memoryStore.worktrees.delete(worktreePath); } catch {}
    
    // Add to archived with updated path
    const archivedWorktree = new WorktreeInfo({
      ...worktree,
      path: archivedPath,
      is_archived: true
    });
    const archived = this.archivedWorktrees.get(worktree.project) || [];
    archived.push(archivedWorktree);
    this.archivedWorktrees.set(worktree.project, archived);
    try {
      const arr = memoryStore.archivedWorktrees.get(worktree.project) || [];
      arr.push(archivedWorktree);
      memoryStore.archivedWorktrees.set(worktree.project, arr);
    } catch {}

    return archivedPath;
  }

  // Unarchive a worktree (create fresh worktree from existing branch)
  unarchiveWorktree(archivedPath: string): string {
    // Check if unarchive should fail (for error testing)
    if ((global as any).__mockGitShouldFail || (global as any).__mockUnarchiveShouldFail) {
      throw new Error('Mock unarchive failure');
    }

    // Find the archived worktree
    let archivedWorktree: any = null;
    let project: string = '';
    let archivedIndex: number = -1;
    let archivedList: any[] = [];
    
    let found = false;
    for (const [proj, list] of this.archivedWorktrees.entries()) {
      const index = list.findIndex(w => w.path === archivedPath);
      if (index >= 0) {
        archivedWorktree = list[index];
        project = proj;
        archivedIndex = index;
        archivedList = list;
        found = true;
        break;
      }
    }
    if (!found) {
      for (const [proj, list] of memoryStore.archivedWorktrees.entries()) {
        const index = list.findIndex(w => w.path === archivedPath);
        if (index >= 0) {
          archivedWorktree = list[index];
          project = proj;
          archivedIndex = index;
          archivedList = list;
          break;
        }
      }
    }
    
    if (!archivedWorktree) {
      throw new Error('Archived worktree not found');
    }

    // Generate restored path (same as old logic)
    const restoredPath = archivedPath
      .replace(DIR_ARCHIVED_SUFFIX, DIR_BRANCHES_SUFFIX)
      .replace(/archived-[0-9-]+_/, '');

    // Check if restored path already exists
    if (this.worktrees.has(restoredPath) || memoryStore.worktrees.has(restoredPath)) {
      throw new Error(`Feature ${project}/${archivedWorktree.feature} already exists in active worktrees`);
    }

    // Verify branch exists (in real implementation this would check git branches)
    // For fake service, we assume the branch exists since archive doesn't delete branches
    
    // Remove from archived (simulating removal of archived directory)
    archivedList.splice(archivedIndex, 1);
    this.archivedWorktrees.set(project, archivedList);
    try {
      const other = memoryStore.archivedWorktrees.get(project) || [];
      const idx = other.findIndex(w => w.path === archivedPath);
      if (idx >= 0) other.splice(idx, 1);
      memoryStore.archivedWorktrees.set(project, other);
    } catch {}

    // Create fresh worktree (simulating git worktree add)
    const restoredWorktree = new WorktreeInfo({
      project: archivedWorktree.project,
      feature: archivedWorktree.feature,
      path: restoredPath,
      branch: archivedWorktree.branch,
      is_archived: false,
      // Fresh worktree starts with clean git status
      git: new GitStatus(),
      session: new SessionInfo({
        session_name: `dev-${project}-${archivedWorktree.feature}`,
        attached: false,
        claude_status: 'not_running'
      })
    });
    
    this.worktrees.set(restoredPath, restoredWorktree);
    try { memoryStore.worktrees.set(restoredPath, restoredWorktree); } catch {}
    return restoredPath;
  }

  // Delete an archived worktree permanently
  deleteArchived(archivedPath: string): boolean {
    // Check if deletion should fail (for error testing)
    if ((global as any).__mockGitShouldFail || (global as any).__mockDeleteShouldFail) {
      return false;
    }

    // Find and remove from archived worktrees
    for (const [project, archivedList] of this.archivedWorktrees.entries()) {
      const index = archivedList.findIndex(w => w.path === archivedPath || w.path.replace(DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX) === archivedPath);
      if (index >= 0) {
        archivedList.splice(index, 1);
        this.archivedWorktrees.set(project, archivedList);
        try {
          const other = memoryStore.archivedWorktrees.get(project) || [];
          const idx = other.findIndex(w => w.path === archivedPath || w.path.replace(DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX) === archivedPath);
          if (idx >= 0) {
            other.splice(idx, 1);
            if (other.length === 0) memoryStore.archivedWorktrees.delete(project);
            else memoryStore.archivedWorktrees.set(project, other);
          }
        } catch {}
        return true;
      }
    }
    // Try memory store if not found in local map
    for (const [project, archivedList] of memoryStore.archivedWorktrees.entries()) {
      const index = archivedList.findIndex(w => w.path === archivedPath || w.path.replace(DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX) === archivedPath);
      if (index >= 0) {
        archivedList.splice(index, 1);
        if (archivedList.length === 0) memoryStore.archivedWorktrees.delete(project);
        else memoryStore.archivedWorktrees.set(project, archivedList);
        return true;
      }
    }
    return false;
  }
}
