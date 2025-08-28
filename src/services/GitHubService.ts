import {PRStatus} from '../models.js';
import {runCommand, runCommandAsync, runCommandQuick, runCommandQuickAsync} from '../utils.js';

export class GitHubService {
  
  private processPRData(output: string, opts: {includeChecks?: boolean; includeTitle?: boolean; branches?: string[]} = {}): Record<string, PRStatus> {
    const prByBranch: Record<string, PRStatus> = {};
    const {includeChecks = true, includeTitle = true, branches} = opts;
    
    if (!output) return prByBranch;
    
    try {
      const data = JSON.parse(output);
      for (const pr of data) {
        const branch = pr.headRefName;
        if (!branch) continue;
        
        // If we're filtering by branches, ensure this PR is for one of the requested branches
        if (branches && branches.length > 0 && !branches.includes(branch)) {
          continue;
        }
        
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

  private buildPRListArgs(opts: {includeChecks?: boolean; includeTitle?: boolean; branches?: string[]} = {}): string[] {
    const fields = ['number', 'state', 'headRefName', 'mergeable'];
    const {includeChecks = true, includeTitle = true, branches} = opts;
    
    if (includeChecks) fields.push('statusCheckRollup');
    if (includeTitle) fields.push('title');
    
    let args = ['gh', 'pr', 'list', '--state', 'all', '--json', fields.join(','), '--limit', '200'];
    
    // Add branch filtering if specified
    if (branches && branches.length > 0) {
      // Use search with head: filter for specific branches (spaces act as implicit OR)
      const searchQuery = branches.map(branch => `head:${branch}`).join(' ');
      args = ['gh', 'pr', 'list', '--search', searchQuery, '--state', 'all', '--json', fields.join(','), '--limit', '200'];
    }
    
    return args;
  }

  batchFetchPRData(repoPath: string, opts: {includeChecks?: boolean; includeTitle?: boolean; branches?: string[]} = {}): Record<string, PRStatus> {
    try {
      const args = this.buildPRListArgs(opts);
      const output = runCommand(args, {cwd: repoPath});
      return this.processPRData(output, opts);
    } catch {
      return {};
    }
  }

  async batchFetchPRDataAsync(repoPath: string, opts: {includeChecks?: boolean; includeTitle?: boolean; branches?: string[]} = {}): Promise<Record<string, PRStatus>> {
    try {
      const args = this.buildPRListArgs(opts);
      const output = await runCommandAsync(args, {cwd: repoPath});
      return this.processPRData(output, opts);
    } catch {
      return {};
    }
  }

  private processWorktreePRResults(
    group: Array<{project: string; path: string}>, 
    pathToBranch: Record<string, string>, 
    prByBranch: Record<string, PRStatus>,
    includeLoadingStatus: boolean = true
  ): Record<string, PRStatus> {
    const result: Record<string, PRStatus> = {};
    
    for (const wt of group) {
      const branch = pathToBranch[wt.path];
      if (branch && prByBranch[branch]) {
        // PR exists - set status appropriately
        if (includeLoadingStatus) {
          result[wt.path] = new PRStatus({
            ...prByBranch[branch],
            loadingStatus: 'exists'
          });
        } else {
          result[wt.path] = prByBranch[branch];
        }
      } else if (includeLoadingStatus) {
        // No PR for this branch - set status to 'no_pr'
        result[wt.path] = new PRStatus({ 
          loadingStatus: 'no_pr' 
        });
      }
    }
    
    return result;
  }

  batchGetPRStatusForWorktrees(worktrees: Array<{project: string; path: string; is_archived?: boolean}>, includeChecks = true): Record<string, PRStatus> {
    const result: Record<string, PRStatus> = {};
    const projectGroups = this.groupWorktreesByProject(worktrees);
    
    for (const [project, group] of Object.entries(projectGroups)) {
      if (!group.length) continue;
      
      const repoPath = group[0].path;
      
      try {
        // Get branch mapping first to know which branches to filter for
        const pathToBranch = this.getWorktreeBranchMapping(repoPath);
        const branches = Object.values(pathToBranch).filter(Boolean);
        
        // Only fetch PRs for the branches we actually need
        const prByBranch = this.batchFetchPRData(repoPath, {
          includeChecks: true, 
          includeTitle: true,
          branches: branches.length > 0 ? branches : undefined
        });
        
        // Process results with minimal status info (for backward compatibility)
        const groupResults = this.processWorktreePRResults(group, pathToBranch, prByBranch, false);
        Object.assign(result, groupResults);
      } catch (error) {
        // Sync version has simpler error handling - just skip failed groups
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
      
      try {
        // Get branch mapping first to know which branches to filter for
        const pathToBranch = await this.getWorktreeBranchMappingAsync(repoPath);
        const branches = Object.values(pathToBranch).filter(Boolean);
        
        // Only fetch PRs for the branches we actually need
        const prByBranch = await this.batchFetchPRDataAsync(repoPath, {
          includeChecks: true, 
          includeTitle: true,
          branches: branches.length > 0 ? branches : undefined
        });
        
        // Process results with full loading status info
        const groupResults = this.processWorktreePRResults(group, pathToBranch, prByBranch, true);
        Object.assign(result, groupResults);
      } catch (error) {
        // API call failed - mark all worktrees in this group as error
        for (const wt of group) {
          result[wt.path] = new PRStatus({ 
            loadingStatus: 'error' 
          });
        }
      }
    }
    
    return result;
  }

  // Note: getPRForWorktree method removed - use batch methods instead for better performance and consistency

  createPR(worktreePath: string, title: string, body?: string): boolean {
    try {
      const args = ['gh', 'pr', 'create', '--title', title];
      if (body) {
        args.push('--body', body);
      }
      const output = runCommand(args, {cwd: worktreePath});
      return !!output;
    } catch {
      return false;
    }
  }

  mergePR(worktreePath: string, method: 'merge' | 'squash' | 'rebase' = 'merge'): boolean {
    try {
      const output = runCommand(['gh', 'pr', 'merge', `--${method}`], {cwd: worktreePath});
      return !!output;
    } catch {
      return false;
    }
  }

  // Private helper methods
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

  private parseWorktreeInfo(wtInfo: string): Record<string, string> {
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

  private getWorktreeBranchMapping(repoPath: string): Record<string, string> {
    const wtInfo = runCommandQuick(['git', '-C', repoPath, 'worktree', 'list', '--porcelain']);
    return this.parseWorktreeInfo(wtInfo);
  }

  private async getWorktreeBranchMappingAsync(repoPath: string): Promise<Record<string, string>> {
    const wtInfo = await runCommandQuickAsync(['git', '-C', repoPath, 'worktree', 'list', '--porcelain']);
    return this.parseWorktreeInfo(wtInfo);
  }
}