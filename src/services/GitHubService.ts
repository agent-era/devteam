import {PRStatus} from '../models.js';
import {runCommand, runCommandAsync, runCommandQuick, runCommandQuickAsync} from '../utils.js';
import {logInfo, logDebug} from '../shared/utils/logger.js';
import {Timer} from '../shared/utils/timing.js';

export class GitHubService {
  
  batchFetchPRData(repoPath: string, opts: {includeChecks?: boolean; includeTitle?: boolean; branches?: string[]} = {}): Record<string, PRStatus> {
    const timer = new Timer();
    const prByBranch: Record<string, PRStatus> = {};
    const fields = ['number', 'state', 'headRefName', 'mergeable'];
    const includeChecks = opts.includeChecks !== false;
    const includeTitle = opts.includeTitle !== false;
    const branches = opts.branches;
    
    if (includeChecks) fields.push('statusCheckRollup');
    if (includeTitle) fields.push('title');
    
    try {
      let args = ['gh', 'pr', 'list', '--state', 'all', '--json', fields.join(','), '--limit', '200'];
      
      // Add branch filtering if specified
      if (branches && branches.length > 0) {
        // Use search with head: filter for specific branches (spaces act as implicit OR)
        const searchQuery = branches.map(branch => `head:${branch}`).join(' ');
        args = ['gh', 'pr', 'list', '--search', searchQuery, '--state', 'all', '--json', fields.join(','), '--limit', '200'];
      }
      
      const output = runCommand(args, {cwd: repoPath});
      if (!output) return prByBranch;
      
      const data = JSON.parse(output);
      
      // Count PRs by state for logging
      const stateCounts = {open: 0, closed: 0, merged: 0};
      
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
        
        // Count by state for logging
        const state = (pr.state || '').toUpperCase();
        if (state === 'OPEN') stateCounts.open++;
        else if (state === 'CLOSED') stateCounts.closed++;
        else if (state === 'MERGED') stateCounts.merged++;
        
        prByBranch[branch] = status;
      }
      
      // Log fetch results
      const timing = timer.elapsed();
      const branchCount = branches?.length || 'all';
      const totalPRs = Object.keys(prByBranch).length;
      logInfo(`[GitHub.PR.Fetch] ${branchCount} branches -> ${totalPRs} PRs (Open: ${stateCounts.open}, Closed: ${stateCounts.closed}, Merged: ${stateCounts.merged}) in ${timing.formatted}`);
      
    } catch {}
    
    return prByBranch;
  }

  async batchFetchPRDataAsync(repoPath: string, opts: {includeChecks?: boolean; includeTitle?: boolean; branches?: string[]} = {}): Promise<Record<string, PRStatus>> {
    const timer = new Timer();
    const prByBranch: Record<string, PRStatus> = {};
    const fields = ['number', 'state', 'headRefName', 'mergeable'];
    const includeChecks = opts.includeChecks !== false;
    const includeTitle = opts.includeTitle !== false;
    const branches = opts.branches;
    
    if (includeChecks) fields.push('statusCheckRollup');
    if (includeTitle) fields.push('title');
    
    try {
      let args = ['gh', 'pr', 'list', '--state', 'all', '--json', fields.join(','), '--limit', '200'];
      
      // Add branch filtering if specified
      if (branches && branches.length > 0) {
        // Use search with head: filter for specific branches (spaces act as implicit OR)
        const searchQuery = branches.map(branch => `head:${branch}`).join(' ');
        args = ['gh', 'pr', 'list', '--search', searchQuery, '--state', 'all', '--json', fields.join(','), '--limit', '200'];
      }
      
      const output = await runCommandAsync(args, {cwd: repoPath});
      if (!output) return prByBranch;
      
      const data = JSON.parse(output);
      
      // Count PRs by state for logging
      const stateCounts = {open: 0, closed: 0, merged: 0};
      
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
        
        // Count by state for logging
        const state = (pr.state || '').toUpperCase();
        if (state === 'OPEN') stateCounts.open++;
        else if (state === 'CLOSED') stateCounts.closed++;
        else if (state === 'MERGED') stateCounts.merged++;
        
        prByBranch[branch] = status;
      }
      
      // Log fetch results
      const timing = timer.elapsed();
      const branchCount = branches?.length || 'all';
      const totalPRs = Object.keys(prByBranch).length;
      logInfo(`[GitHub.PR.FetchAsync] ${branchCount} branches -> ${totalPRs} PRs (Open: ${stateCounts.open}, Closed: ${stateCounts.closed}, Merged: ${stateCounts.merged}) in ${timing.formatted}`);
      
    } catch {}
    
    return prByBranch;
  }

  batchGetPRStatusForWorktrees(worktrees: Array<{project: string; path: string; is_archived?: boolean}>, includeChecks = true): Record<string, PRStatus> {
    const result: Record<string, PRStatus> = {};
    const projectGroups = this.groupWorktreesByProject(worktrees);
    
    for (const [project, group] of Object.entries(projectGroups)) {
      if (!group.length) continue;
      
      const repoPath = group[0].path;
      
      // Get branch mapping first to know which branches to filter for
      const pathToBranch = this.getWorktreeBranchMapping(repoPath);
      const branches = Object.values(pathToBranch).filter(Boolean);
      
      // Only fetch PRs for the branches we actually need
      const prByBranch = this.batchFetchPRData(repoPath, {
        includeChecks: true, 
        includeTitle: true,
        branches: branches.length > 0 ? branches : undefined
      });
      
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
        
        // Set status for each worktree based on results
        for (const wt of group) {
          const branch = pathToBranch[wt.path];
          if (branch && prByBranch[branch]) {
            // PR exists - set status to 'exists' and copy PR data
            result[wt.path] = new PRStatus({
              ...prByBranch[branch],
              loadingStatus: 'exists'
            });
          } else {
            // No PR for this branch - set status to 'no_pr'
            result[wt.path] = new PRStatus({ 
              loadingStatus: 'no_pr' 
            });
          }
        }
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

  getPRForWorktree(worktreePath: string): any | null {
    const output = runCommandQuick(['bash', '-lc', `cd ${JSON.stringify(worktreePath)} && gh pr view --json state,url,mergeStateStatus,headRefName 2>/dev/null || true`]);
    if (!output) return null;
    
    try {
      const data = JSON.parse(output);
      return {
        state: data.state || 'none',
        url: data.url || null,
        ci_status: data.mergeStateStatus || 'unknown',
        head: data.headRefName || null,
      };
    } catch {
      return null;
    }
  }

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