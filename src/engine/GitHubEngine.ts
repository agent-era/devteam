import {PRStatus} from '../models.js';
import {GitHubService} from '../services/GitHubService.js';
import {PRStatusCacheService} from '../services/PRStatusCacheService.js';
import {PR_REFRESH_DURATION} from '../constants.js';
import {logDebug, logError} from '../shared/utils/logger.js';

type WT = {project: string; path: string; is_archived?: boolean};

export class GitHubEngine {
  private gh: GitHubService;
  private cache: PRStatusCacheService;
  private lastRefreshAt = 0;
  private refreshIntervalMs: number;

  constructor(opts: {service?: GitHubService; cache?: PRStatusCacheService; refreshIntervalMs?: number} = {}) {
    this.gh = opts.service || new GitHubService();
    this.cache = opts.cache || new PRStatusCacheService();
    this.refreshIntervalMs = Math.max(1000, opts.refreshIntervalMs ?? Number(process.env.PR_REFRESH_INTERVAL_MS || PR_REFRESH_DURATION));
    // Warm cache from persisted entries
    try {
      const cachedPaths = this.cache.getCachedPaths();
      for (const p of cachedPaths) {
        this.cache.get(p);
      }
    } catch {}
  }

  get(path: string): PRStatus | null {
    return this.cache.get(path);
  }

  getMap(): Record<string, PRStatus> {
    const out: Record<string, PRStatus> = {};
    for (const p of this.cache.getCachedPaths()) {
      const v = this.cache.get(p);
      if (v) out[p] = v;
    }
    return out;
  }

  shouldRefresh(): boolean {
    return Date.now() - this.lastRefreshAt >= this.refreshIntervalMs;
  }

  async refresh(worktrees: WT[], includeChecks: boolean = true): Promise<void> {
    if (worktrees.length === 0) return;
    try {
      const prMap = await this.gh.batchGetPRStatusForWorktreesAsync(worktrees, includeChecks);
      const successfulPaths: string[] = [];
      const errorPaths: string[] = [];
      for (const [path, prStatus] of Object.entries(prMap)) {
        if (prStatus.loadingStatus === 'error') {
          errorPaths.push(path);
        } else {
          this.cache.set(path, prStatus);
          successfulPaths.push(path);
        }
      }
      this.lastRefreshAt = Date.now();
      logDebug(`[GitHubEngine] Refreshed PRs: ok=${successfulPaths.length}, err=${errorPaths.length}`);
    } catch (error) {
      logError('[GitHubEngine] refresh failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

