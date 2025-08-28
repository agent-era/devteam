import {PRStatus} from '../../src/models.js';
import {memoryStore} from './stores.js';

export class FakeGitHubService {
  
  batchFetchPRData(repoPath: string, opts: {includeChecks?: boolean; includeTitle?: boolean} = {}): Record<string, PRStatus> {
    // Return fake PR data from memory store
    const result: Record<string, PRStatus> = {};
    for (const [path, pr] of memoryStore.prStatus.entries()) {
      if (path.includes(repoPath) || repoPath.includes('fake')) {
        // Extract branch name from path
        const parts = path.split('/');
        const branchName = parts[parts.length - 1];
        result[branchName] = pr;
      }
    }
    return result;
  }

  async batchFetchPRDataAsync(repoPath: string, opts: {includeChecks?: boolean; includeTitle?: boolean} = {}): Promise<Record<string, PRStatus>> {
    return this.batchFetchPRData(repoPath, opts);
  }

  batchGetPRStatusForWorktrees(worktrees: Array<{project: string; path: string; is_archived?: boolean}>, includeChecks = true): Record<string, PRStatus> {
    const result: Record<string, PRStatus> = {};
    
    for (const wt of worktrees) {
      if (wt.is_archived) continue;
      const pr = memoryStore.prStatus.get(wt.path);
      if (pr) {
        result[wt.path] = pr;
      } else {
        // Return 'no_pr' status instead of default 'not_checked'
        result[wt.path] = new PRStatus({ loadingStatus: 'no_pr' });
      }
    }
    
    return result;
  }

  async batchGetPRStatusForWorktreesAsync(worktrees: Array<{project: string; path: string; is_archived?: boolean}>, includeChecks = true): Promise<Record<string, PRStatus>> {
    return this.batchGetPRStatusForWorktrees(worktrees, includeChecks);
  }

  // getPRForWorktree method removed - use batch methods instead
  // Legacy method for backward compatibility during transition
  getPRForWorktree(worktreePath: string): any | null {
    const pr = memoryStore.prStatus.get(worktreePath);
    if (pr) {
      return {
        state: pr.state || 'none',
        url: pr.url || null,
        ci_status: pr.checks || 'unknown',
        head: 'feature-branch',
      };
    }
    return null;
  }

  createPR(worktreePath: string, title: string, body?: string): boolean {
    // Simulate successful PR creation
    const pr = new PRStatus({
      number: Math.floor(Math.random() * 1000),
      state: 'OPEN',
      checks: 'pending',
      url: `https://github.com/fake/repo/pull/${Math.floor(Math.random() * 1000)}`
    });
    
    memoryStore.prStatus.set(worktreePath, pr);
    return true;
  }

  mergePR(worktreePath: string, method: 'merge' | 'squash' | 'rebase' = 'merge'): boolean {
    const pr = memoryStore.prStatus.get(worktreePath);
    if (pr) {
      pr.state = 'MERGED';
      memoryStore.prStatus.set(worktreePath, pr);
      return true;
    }
    return false;
  }
}