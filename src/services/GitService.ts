import fs from 'node:fs';
import path from 'node:path';
import {GitStatus, ProjectInfo, PRStatus} from '../models.js';
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

export class GitService {
  basePath: string;

  constructor(basePath: string = BASE_PATH) {
    this.basePath = basePath;
  }

  discoverProjects(): ProjectInfo[] {
    if (!fs.existsSync(this.basePath)) return [];
    
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
    
    return projects;
  }

  getWorktreesForProject(project: ProjectInfo): Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string; 
    mtime: number
  }> {
    const worktrees: Array<{project: string; feature: string; path: string; branch: string; mtime: number}> = [];
    const branchesDirName = `${project.name}${DIR_BRANCHES_SUFFIX}`;
    const output = runCommand(['git', '-C', project.path, 'worktree', 'list', '--porcelain']);
    if (!output) return worktrees;

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
    return worktrees;
  }

  getGitStatus(worktreePath: string): GitStatus {
    const status = new GitStatus();
    
    const porcelainStatus = runCommandQuick(['git', '-C', worktreePath, 'status', '--porcelain']);
    if (porcelainStatus) {
      status.modified_files = porcelainStatus.split('\n').filter(Boolean).length;
      status.has_changes = true;
    }
    
    const diffStats = runCommandQuick(['git', '-C', worktreePath, 'diff', '--shortstat', 'HEAD']);
    if (diffStats) {
      const [added, deleted] = parseGitShortstat(diffStats);
      status.added_lines = added;
      status.deleted_lines = deleted;
    }
    
    if (porcelainStatus) {
      status.untracked_lines = this.countUntrackedLines(worktreePath, porcelainStatus);
    }
    
    this.addBaseBranchComparison(worktreePath, status);
    this.addRemoteTrackingInfo(worktreePath, status);
    
    return status;
  }


  createWorktree(project: string, featureName: string, branchName?: string): boolean {
    const mainRepo = path.join(this.basePath, project);
    const branchesDir = path.join(this.basePath, `${project}${DIR_BRANCHES_SUFFIX}`);
    const worktreePath = path.join(branchesDir, featureName);
    
    ensureDirectory(branchesDir);
    if (fs.existsSync(worktreePath)) return false;
    
    const branch = branchName || `feature/${featureName}`;
    runCommand(['git', '-C', mainRepo, 'worktree', 'add', worktreePath, '-b', branch], {timeout: 30000});
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

  getRemoteBranches(project: string): Array<Record<string, any>> {
    const mainRepo = path.join(this.basePath, project);
    const output = runCommand(['git', '-C', mainRepo, 'branch', '-a', '--format=%(refname:short)']);
    const branches: any[] = [];
    if (!output) return branches;

    const existing = this.getWorktreesForProject(new ProjectInfo({name: project, path: mainRepo}))
      .map((wt) => wt.branch.replace('refs/heads/', ''));
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

  // PR Status Methods
  batchFetchPRData(repoPath: string, opts: {includeChecks?: boolean; includeTitle?: boolean} = {}): Record<string, PRStatus> {
    const prByBranch: Record<string, PRStatus> = {};
    const fields = ['number', 'state', 'headRefName', 'mergeable'];
    const includeChecks = opts.includeChecks !== false;
    const includeTitle = opts.includeTitle !== false;
    
    if (includeChecks) fields.push('statusCheckRollup');
    if (includeTitle) fields.push('title');
    
    try {
      const output = runCommand(['gh', 'pr', 'list', '--state', 'all', '--json', fields.join(','), '--limit', '200'], {cwd: repoPath});
      if (!output) return prByBranch;
      
      const data = JSON.parse(output);
      for (const pr of data) {
        const branch = pr.headRefName;
        if (!branch) continue;
        
        const status = new PRStatus();
        status.number = pr.number ?? null;
        status.state = (pr.state || '').toUpperCase();
        
        if (includeChecks && pr.statusCheckRollup) {
          status.checks = this.parseCheckStatus(pr.statusCheckRollup);
        }
        if (pr.url) (status as any).url = pr.url;
        if (includeTitle && pr.title) (status as any).title = pr.title;
        (status as any).mergeable = pr.mergeable ?? null;
        
        prByBranch[branch] = status;
      }
    } catch {}
    
    return prByBranch;
  }

  async batchFetchPRDataAsync(repoPath: string, opts: {includeChecks?: boolean; includeTitle?: boolean} = {}): Promise<Record<string, PRStatus>> {
    const prByBranch: Record<string, PRStatus> = {};
    const fields = ['number', 'state', 'headRefName', 'mergeable'];
    const includeChecks = opts.includeChecks !== false;
    const includeTitle = opts.includeTitle !== false;
    
    if (includeChecks) fields.push('statusCheckRollup');
    if (includeTitle) fields.push('title');
    
    try {
      const output = await runCommandAsync(['gh', 'pr', 'list', '--state', 'all', '--json', fields.join(','), '--limit', '200'], {cwd: repoPath});
      if (!output) return prByBranch;
      
      const data = JSON.parse(output);
      for (const pr of data) {
        const branch = pr.headRefName;
        if (!branch) continue;
        
        const status = new PRStatus();
        status.number = pr.number ?? null;
        status.state = (pr.state || '').toUpperCase();
        
        if (includeChecks && pr.statusCheckRollup) {
          status.checks = this.parseCheckStatus(pr.statusCheckRollup);
        }
        if (pr.url) (status as any).url = pr.url;
        if (includeTitle && pr.title) (status as any).title = pr.title;
        (status as any).mergeable = pr.mergeable ?? null;
        
        prByBranch[branch] = status;
      }
    } catch {}
    
    return prByBranch;
  }

  batchGetPRStatusForWorktrees(worktrees: Array<{project: string; path: string; is_archived?: boolean}>, includeChecks = true): Record<string, PRStatus> {
    const result: Record<string, PRStatus> = {};
    const projectGroups = this.groupWorktreesByProject(worktrees);
    
    for (const [project, group] of Object.entries(projectGroups)) {
      if (!group.length) continue;
      
      const repoPath = group[0].path;
      for (const wt of group) result[wt.path] = new PRStatus();
      
      const prByBranch = this.batchFetchPRData(repoPath, {includeChecks: true, includeTitle: true});
      const pathToBranch = this.getWorktreeBranchMapping(repoPath);
      
      for (const wt of group) {
        const branch = pathToBranch[wt.path];
        if (branch && prByBranch[branch]) {
          result[wt.path] = prByBranch[branch];
        }
      }
    }
    
    return result;
  }

  async batchGetPRStatusForWorktreesAsync(worktrees: Array<{project: string; path: string; is_archived?: boolean}>, includeChecks = true): Promise<Record<string, PRStatus>> {
    const result: Record<string, PRStatus> = {};
    const projectGroups = this.groupWorktreesByProject(worktrees);
    
    for (const [project, group] of Object.entries(projectGroups)) {
      if (!group.length) continue;
      
      const repoPath = group[0].path;
      for (const wt of group) result[wt.path] = new PRStatus();
      
      const prByBranch = await this.batchFetchPRDataAsync(repoPath, {includeChecks: true, includeTitle: true});
      const pathToBranch = await this.getWorktreeBranchMappingAsync(repoPath);
      
      for (const wt of group) {
        const branch = pathToBranch[wt.path];
        if (branch && prByBranch[branch]) {
          result[wt.path] = prByBranch[branch];
        }
      }
    }
    
    return result;
  }

  // Private helper methods
  private countUntrackedLines(worktreePath: string, porcelainStatus: string): number {
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

  private addBaseBranchComparison(worktreePath: string, status: GitStatus): void {
    const base = findBaseBranch(worktreePath);
    if (base) {
      const mergeBase = runCommandQuick(['git', '-C', worktreePath, 'merge-base', 'HEAD', base]);
      if (mergeBase) {
        const committed = runCommandQuick(['git', '-C', worktreePath, 'diff', '--shortstat', mergeBase.trim(), 'HEAD']);
        const [committedAdded, committedDeleted] = committed ? parseGitShortstat(committed) : [0, 0];
        status.base_added_lines = committedAdded + status.added_lines + status.untracked_lines;
        status.base_deleted_lines = committedDeleted + status.deleted_lines;
      }
    }
  }

  private addRemoteTrackingInfo(worktreePath: string, status: GitStatus): void {
    const upstream = runCommandQuick(['git', '-C', worktreePath, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    if (upstream && !/fatal|no upstream/i.test(upstream)) {
      status.has_remote = true;
      const revList = runCommandQuick(['git', '-C', worktreePath, 'rev-list', '--left-right', '--count', 'HEAD...@{u}']);
      if (revList) {
        const [ahead, behind] = revList.split('\t').map((x) => Number(x.trim()));
        status.ahead = ahead || 0;
        status.behind = behind || 0;
      }
      status.is_pushed = status.ahead === 0 && !status.has_changes;
    } else {
      const base = findBaseBranch(worktreePath);
      if (base) {
        const revList = runCommandQuick(['git', '-C', worktreePath, 'rev-list', '--left-right', '--count', `HEAD...${base}`]);
        if (revList) {
          const [ahead, behind] = revList.split('\t').map((x) => Number(x.trim()));
          status.ahead = ahead || 0;
          status.behind = behind || 0;
        }
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

  private parseCheckStatus(checks: any[]): string | null {
    let hasFailure = false, hasPending = false, hasSuccess = false;
    
    for (const check of checks) {
      const conclusion = (check?.conclusion || check?.state || '').toString().toUpperCase();
      if (['SUCCESS', 'PASS'].includes(conclusion)) hasSuccess = true;
      else if (['FAILURE', 'ERROR'].includes(conclusion)) hasFailure = true;
      else hasPending = true;
    }
    
    if (hasFailure) return 'failing';
    if (hasPending) return 'pending';
    if (hasSuccess) return 'passing';
    return null;
  }

  private groupWorktreesByProject(worktrees: Array<{project: string; path: string; is_archived?: boolean}>): Record<string, Array<{project: string; path: string}>> {
    const groups: Record<string, Array<{project: string; path: string}>> = {};
    
    for (const wt of worktrees) {
      if ((wt as any).is_archived) continue;
      const project = wt.project;
      if (!groups[project]) groups[project] = [];
      groups[project].push({project: wt.project, path: wt.path});
    }
    
    return groups;
  }

  private getWorktreeBranchMapping(repoPath: string): Record<string, string> {
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

  private async getWorktreeBranchMappingAsync(repoPath: string): Promise<Record<string, string>> {
    const wtInfo = await runCommandQuickAsync(['git', '-C', repoPath, 'worktree', 'list', '--porcelain']);
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
}