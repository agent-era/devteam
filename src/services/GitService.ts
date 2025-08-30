import fs from 'node:fs';
import path from 'node:path';
import {GitStatus, ProjectInfo} from '../models.js';
import {
  BASE_PATH,
  BASE_BRANCH_CANDIDATES,
  DIR_BRANCHES_SUFFIX,
  DIR_ARCHIVED_SUFFIX,
} from '../constants.js';
import {
  runCommand,
  runCommandQuick,
  runCommandAsync,
  runCommandQuickAsync,
  parseGitShortstat,
  findBaseBranch,
  ensureDirectory,
  formatTimeAgo,
} from '../utils.js';
import {logDebug} from '../shared/utils/logger.js';
import {Timer} from '../shared/utils/timing.js';

export class GitService {
  basePath: string;

  constructor(basePath: string = BASE_PATH) {
    this.basePath = basePath;
  }

  discoverProjects(): ProjectInfo[] {
    const timer = new Timer();
    
    if (!fs.existsSync(this.basePath)) {
      logDebug(`[Project.Discovery] Base path does not exist: ${this.basePath}`);
      return [];
    }
    
    const entries = fs.readdirSync(this.basePath, {withFileTypes: true});
    const projects = entries
      .filter(
        (e) =>
          e.isDirectory() &&
          !e.name.includes(DIR_ARCHIVED_SUFFIX) &&
          !e.name.includes(DIR_BRANCHES_SUFFIX) &&
          fs.existsSync(path.join(this.basePath, e.name, '.git'))
      )
      .map((e) => new ProjectInfo({name: e.name, path: path.join(this.basePath, e.name)}))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const timing = timer.elapsed();
    logDebug(`[Project.Discovery] Found ${projects.length} projects in ${timing.formatted}`);
    
    return projects;
  }

  async getWorktreesForProject(project: ProjectInfo): Promise<Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string; 
    mtime: number
  }>> {
    const timer = new Timer();
    const worktrees: Array<{project: string; feature: string; path: string; branch: string; mtime: number}> = [];
    const branchesDirName = `${project.name}${DIR_BRANCHES_SUFFIX}`;
    const output = await runCommandAsync(['git', '-C', project.path, 'worktree', 'list', '--porcelain']);
    if (!output) {
      logDebug(`[Worktree.Collection] ${project.name}: no worktrees found`);
      return worktrees;
    }

    let current: {path?: string; branch?: string} = {};
    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path && current.path.includes(branchesDirName)) {
          const wtPath = current.path;
          const feature = path.basename(wtPath);
          const mtime = fs.existsSync(wtPath) ? fs.statSync(wtPath).mtimeMs : 0;
          worktrees.push({
            project: project.name,
            feature,
            path: wtPath,
            branch: current.branch || 'unknown',
            mtime,
          });
        }
        current = {path: line.slice(9)};
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7);
      }
    }
    
    // Handle last entry
    if (current.path && current.path.includes(branchesDirName)) {
      const wtPath = current.path;
      const feature = path.basename(wtPath);
      const mtime = fs.existsSync(wtPath) ? fs.statSync(wtPath).mtimeMs : 0;
      worktrees.push({
        project: project.name,
        feature,
        path: wtPath,
        branch: current.branch || 'unknown',
        mtime,
      });
    }
    
    worktrees.sort((a, b) => b.mtime - a.mtime);
    
    const timing = timer.elapsed();
    logDebug(`[Worktree.Collection] ${project.name}: ${worktrees.length} worktrees in ${timing.formatted}`);
    
    return worktrees;
  }

  async getGitStatus(worktreePath: string): Promise<GitStatus> {
    const timer = new Timer();
    const status = new GitStatus();
    const worktreeName = path.basename(worktreePath);
    
    const porcelainStatus = await runCommandQuickAsync(['git', '-C', worktreePath, 'status', '--porcelain']);
    if (porcelainStatus) {
      status.modified_files = porcelainStatus.split('\n').filter(Boolean).length;
      status.has_changes = true;
    }
    
    const diffStats = await runCommandQuickAsync(['git', '-C', worktreePath, 'diff', '--shortstat', 'HEAD']);
    if (diffStats) {
      const [added, deleted] = parseGitShortstat(diffStats);
      status.added_lines = added;
      status.deleted_lines = deleted;
    }
    
    if (porcelainStatus) {
      status.untracked_lines = await this.countUntrackedLines(worktreePath, porcelainStatus);
    }
    
    await this.addBaseBranchComparison(worktreePath, status);
    await this.addRemoteTrackingInfo(worktreePath, status);
    
    // Only log if there are significant changes
    if (status.modified_files > 5 || status.added_lines + status.deleted_lines > 50) {
      const timing = timer.elapsed();
      const changesDesc = `${status.modified_files} modified files, +${status.added_lines}/-${status.deleted_lines} lines`;
      logDebug(`[Git.Status] ${worktreeName}: ${changesDesc} in ${timing.formatted}`);
    }
    
    return status;
  }


  createWorktree(project: string, featureName: string, branchName?: string): boolean {
    const mainRepo = path.join(this.basePath, project);
    const branchesDir = path.join(this.basePath, `${project}${DIR_BRANCHES_SUFFIX}`);
    const worktreePath = path.join(branchesDir, featureName);
    
    ensureDirectory(branchesDir);
    if (fs.existsSync(worktreePath)) return false;
    
    // Fetch latest changes from origin
    runCommand(['git', '-C', mainRepo, 'fetch', 'origin'], {timeout: 30000});
    
    // Find the base branch (main or master)
    const baseBranch = findBaseBranch(mainRepo, BASE_BRANCH_CANDIDATES);
    if (!baseBranch) return false;
    
    // Ensure we use the origin version of the base branch
    const originBase = baseBranch.startsWith('origin/') ? baseBranch : `origin/${baseBranch}`;
    
    const branch = branchName || `feature/${featureName}`;
    runCommand(['git', '-C', mainRepo, 'worktree', 'add', worktreePath, '-b', branch, originBase], {timeout: 30000});
    return fs.existsSync(worktreePath);
  }

  createWorktreeFromRemote(project: string, remoteBranch: string, localName: string): boolean {
    const mainRepo = path.join(this.basePath, project);
    const branchesDir = path.join(this.basePath, `${project}${DIR_BRANCHES_SUFFIX}`);
    const worktreePath = path.join(branchesDir, localName);
    
    ensureDirectory(branchesDir);
    if (fs.existsSync(worktreePath)) return false;
    
    const localBranch = remoteBranch.startsWith('origin/') ? remoteBranch.slice(7) : remoteBranch;
    const exists = runCommandQuick(['git', '-C', mainRepo, 'rev-parse', '--verify', localBranch]);
    
    if (exists && !/fatal/i.test(exists)) {
      runCommand(['git', '-C', mainRepo, 'worktree', 'add', worktreePath, localBranch]);
    } else {
      runCommand(['git', '-C', mainRepo, 'worktree', 'add', '--track', '-b', localBranch, worktreePath, remoteBranch]);
    }
    
    return fs.existsSync(worktreePath);
  }

  async getRemoteBranches(project: string): Promise<Array<Record<string, any>>> {
    const mainRepo = path.join(this.basePath, project);
    const output = runCommand(['git', '-C', mainRepo, 'branch', '-a', '--format=%(refname:short)']);
    const branches: any[] = [];
    if (!output) return branches;

    const worktrees = await this.getWorktreesForProject(new ProjectInfo({name: project, path: mainRepo}));
    const existing = worktrees.map((wt) => wt.branch.replace('refs/heads/', ''));
    const base = findBaseBranch(mainRepo, BASE_BRANCH_CANDIDATES);
    if (!base) return branches;

    const candidateBranches = this.parseBranchCandidates(output, existing, base);
    
    for (const [name, clean] of candidateBranches) {
      const branchInfo = this.getBranchInfo(mainRepo, name, clean, base);
      if (branchInfo) {
        branches.push(branchInfo);
      }
    }
    
    branches.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return branches;
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
    const archived: Array<{
      project: string; 
      feature: string; 
      path: string; 
      branch: string; 
      archived_date?: string; 
      is_archived: boolean; 
      mtime: number
    }> = [];
    
    const archivedRoot = path.join(this.basePath, `${project.name}${DIR_ARCHIVED_SUFFIX}`);
    if (!fs.existsSync(archivedRoot)) return archived;

    for (const entry of fs.readdirSync(archivedRoot, {withFileTypes: true})) {
      if (!entry.isDirectory()) continue;
      
      const entryPath = path.join(archivedRoot, entry.name);
      const mtime = fs.statSync(entryPath).mtimeMs;
      const {feature, archived_date} = this.parseArchivedName(entry.name);
      
      archived.push({
        project: project.name,
        feature: feature || entry.name,
        path: entryPath,
        branch: 'archived',
        archived_date,
        is_archived: true,
        mtime,
      });
    }
    
    archived.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    return archived;
  }


  // Private helper methods
  private async countUntrackedLines(worktreePath: string, porcelainStatus: string): Promise<number> {
    let untracked = 0;
    for (const line of porcelainStatus.split('\n')) {
      if (line.startsWith('??')) {
        const filename = line.slice(3);
        const filePath = path.join(worktreePath, filename);
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath, 'utf8');
            untracked += content.split('\n').length;
          }
        } catch {}
      }
    }
    return untracked;
  }

  private async addBaseBranchComparison(worktreePath: string, status: GitStatus): Promise<void> {
    const base = findBaseBranch(worktreePath);
    if (base) {
      const mergeBase = await runCommandQuickAsync(['git', '-C', worktreePath, 'merge-base', 'HEAD', base]);
      if (mergeBase) {
        const committed = await runCommandQuickAsync(['git', '-C', worktreePath, 'diff', '--shortstat', mergeBase.trim(), 'HEAD']);
        const [committedAdded, committedDeleted] = committed ? parseGitShortstat(committed) : [0, 0];
        status.base_added_lines = committedAdded + status.added_lines + status.untracked_lines;
        status.base_deleted_lines = committedDeleted + status.deleted_lines;
      }
    }
  }

  private async addRemoteTrackingInfo(worktreePath: string, status: GitStatus): Promise<void> {
    const upstream = await runCommandQuickAsync(['git', '-C', worktreePath, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    if (upstream && !/fatal|no upstream/i.test(upstream)) {
      status.has_remote = true;
      const revList = await runCommandQuickAsync(['git', '-C', worktreePath, 'rev-list', '--left-right', '--count', 'HEAD...@{u}']);
      if (revList) {
        const [ahead, behind] = revList.split('\t').map((x) => Number(x.trim()));
        status.ahead = ahead || 0;
        status.behind = behind || 0;
      }
      status.is_pushed = status.ahead === 0 && !status.has_changes;
    } else {
      const base = findBaseBranch(worktreePath);
      if (base) {
        const revList = await runCommandQuickAsync(['git', '-C', worktreePath, 'rev-list', '--left-right', '--count', `HEAD...${base}`]);
        if (revList) {
          const [ahead, behind] = revList.split('\t').map((x) => Number(x.trim()));
          status.ahead = ahead || 0;
          status.behind = behind || 0;
        }
        status.is_pushed = false;
      }
    }
  }


  private parseBranchCandidates(output: string, existing: string[], base: string): Array<[string, string]> {
    const candidates: Array<[string, string]> = [];
    const seen = new Set<string>();
    
    for (const line of output.trim().split('\n')) {
      let name = line.trim();
      if (!name) continue;
      if (name.startsWith('remotes/origin/')) name = name.replace('remotes/origin/', 'origin/');
      if (name.includes('HEAD') || BASE_BRANCH_CANDIDATES.includes(name)) continue;
      
      const isRemote = name.startsWith('origin/');
      const clean = isRemote ? name.slice(7) : name;
      
      if (existing.includes(clean) || existing.includes(`feature/${clean}`)) continue;
      if (BASE_BRANCH_CANDIDATES.includes(clean)) continue;
      if (seen.has(clean)) continue;
      
      seen.add(clean);
      candidates.push([name, clean]);
    }
    
    return candidates;
  }

  private getBranchInfo(mainRepo: string, name: string, clean: string, base: string): any | null {
    const revList = runCommandQuick(['git', '-C', mainRepo, 'rev-list', '--left-right', '--count', `${base}...${name}`]);
    if (!revList) return null;
    
    const parts = revList.trim().split(/\s+/);
    if (parts.length !== 2) return null;
    
    const behind = Number(parts[0]);
    const ahead = Number(parts[1]);
    
    let added = 0, deleted = 0;
    if (ahead > 0) {
      const diff = runCommandQuick(['git', '-C', mainRepo, 'diff', '--shortstat', `${base}...${name}`]);
      if (diff) [added, deleted] = parseGitShortstat(diff);
    }
    
    if (ahead === 0 && added === 0 && deleted === 0) return null;
    
    const timestamp = this.getBranchTimestamp(mainRepo, name);
    const lastCommitDate = timestamp ? formatTimeAgo(timestamp) : '';
    
    return {
      name, 
      local_name: clean, 
      is_remote: name.startsWith('origin/'), 
      ahead, 
      behind, 
      added_lines: added, 
      deleted_lines: deleted, 
      timestamp, 
      last_commit_date: lastCommitDate
    };
  }

  private getBranchTimestamp(mainRepo: string, name: string): number {
    const ts = runCommandQuick(['git', '-C', mainRepo, 'log', '-1', '--format=%at', name]);
    return ts ? Number(ts.trim()) : 0;
  }

  private parseArchivedName(name: string): {feature: string; archived_date?: string} {
    if (name.startsWith('archived-')) {
      const rest = name.slice('archived-'.length);
      const underscoreIdx = rest.indexOf('_');
      if (underscoreIdx > 0) {
        return {
          feature: rest.slice(underscoreIdx + 1),
          archived_date: rest.slice(0, underscoreIdx)
        };
      } else {
        const parts = rest.split('-');
        if (parts.length >= 3) {
          return {
            feature: parts.slice(0, -2).join('-'),
            archived_date: parts.slice(-2).join('-')
          };
        } else {
          return {feature: rest};
        }
      }
    }
    return {feature: name};
  }

  getWorktreeBranchMapping(repoPath: string): Record<string, string> {
    const wtInfo = runCommandQuick(['git', '-C', repoPath, 'worktree', 'list', '--porcelain']);
    const pathToBranch: Record<string, string> = {};
    let currentPath: string | null = null;
    
    if (wtInfo) {
      for (const line of wtInfo.trim().split('\n')) {
        if (line.startsWith('worktree ')) {
          currentPath = line.slice(9).trim();
        } else if (line.startsWith('branch ') && currentPath) {
          let branch = line.slice(7).trim();
          if (branch.startsWith('refs/heads/')) branch = branch.slice(11);
          pathToBranch[currentPath] = branch;
          currentPath = null;
        }
      }
    }
    
    return pathToBranch;
  }

  async fetchMainBranch(repoPath: string): Promise<void> {
    try {
      await runCommandQuickAsync(['git', '-C', repoPath, 'fetch', 'origin', 'main']);
    } catch {
      // Silent failure - might not have main branch, try master
      try {
        await runCommandQuickAsync(['git', '-C', repoPath, 'fetch', 'origin', 'master']);
      } catch {
        // Silent failure - can't fetch
      }
    }
  }

  async findMergedPRsInHistory(repoPath: string, limit: number = 20): Promise<number[]> {
    try {
      const log = await runCommandQuickAsync([
        'git', '-C', repoPath, 
        'log', 'origin/main', 
        '--format=%s', 
        `-n`, `${limit}`
      ]);
      
      if (!log) return [];
      
      const prNumbers: number[] = [];
      const matches = log.matchAll(/\(#(\d+)\)/g);
      for (const match of matches) {
        prNumbers.push(parseInt(match[1]));
      }
      
      return prNumbers;
    } catch {
      // Try master if main doesn't exist
      try {
        const log = await runCommandQuickAsync([
          'git', '-C', repoPath, 
          'log', 'origin/master', 
          '--format=%s', 
          `-n`, `${limit}`
        ]);
        
        if (!log) return [];
        
        const prNumbers: number[] = [];
        const matches = log.matchAll(/\(#(\d+)\)/g);
        for (const match of matches) {
          prNumbers.push(parseInt(match[1]));
        }
        
        return prNumbers;
      } catch {
        return [];
      }
    }
  }
}