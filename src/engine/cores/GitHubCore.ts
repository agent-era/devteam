import {CoreBase} from '../core-types.js';
import {PRStatus} from '../../models.js';
import {GitHubService} from '../../services/GitHubService.js';
import {GitService} from '../../services/GitService.js';
import {getProjectsDirectory} from '../../config.js';
import {PRStatusCacheService} from '../../services/PRStatusCacheService.js';
import {createThrottledBatch} from '../../shared/utils/throttle.js';
import {startIntervalIfEnabled, startTimeoutIfEnabled} from '../../shared/utils/intervals.js';
import {PR_REFRESH_DURATION} from '../../constants.js';
import {isAppIntervalsEnabled} from '../../config.js';

type State = {
  pullRequests: Record<string, PRStatus>;
  loading: boolean;
  lastUpdated: number;
  visibleWorktrees: string[];
};

type WT = {project: string; path: string; is_archived?: boolean};

export class GitHubCore implements CoreBase<State> {
  private ts(): string { return new Date().toISOString(); }
  private state: State = {pullRequests: {}, loading: false, lastUpdated: 0, visibleWorktrees: []};
  private listeners = new Set<(s: Readonly<State>) => void>();
  private gitHubService: GitHubService;
  private gitService: GitService;
  private cacheService: PRStatusCacheService;
  private refreshMs: number;
  private intervalCleanup: (() => void) | null = null;
  private visibleDebounceCleanup: (() => void) | null = null;
  private throttledRefresh: ReturnType<typeof createThrottledBatch<{worktrees: WT[]; visibleOnly: boolean}>>;

  constructor(opts?: {gitHubService?: GitHubService; gitService?: GitService; refreshMs?: number}) {
    this.gitHubService = opts?.gitHubService || new GitHubService();
    this.gitService = opts?.gitService || new GitService(getProjectsDirectory());
    this.cacheService = new PRStatusCacheService();
    this.refreshMs = Math.max(1000, Number(process.env.PR_REFRESH_INTERVAL_MS || opts?.refreshMs || PR_REFRESH_DURATION));

    // Seed initial state from disk cache synchronously so first snapshot has PRs
    try {
      const paths = this.cacheService.getCachedPaths?.() || [];
      if (paths.length) {
        const map: Record<string, PRStatus> = {} as any;
        for (const p of paths) {
          const pr = this.cacheService.get(p);
          if (pr && pr.loadingStatus !== 'not_checked' && pr.loadingStatus !== 'loading') {
            map[p] = pr;
          }
        }
        if (Object.keys(map).length) {
          // Set state directly without notifying (constructor) so initial get() includes cache
          this.state = Object.freeze({ ...this.state, pullRequests: { ...this.state.pullRequests, ...map }, lastUpdated: Date.now() });
        }
      }
    } catch {}

    this.throttledRefresh = createThrottledBatch<{worktrees: WT[]; visibleOnly: boolean}>(
      this.refreshMs,
      async ({worktrees, visibleOnly}) => this.refreshPRStatusInternal(worktrees, visibleOnly),
      (pending) => {
        const map = new Map<string, WT>();
        let visibleOnly = true;
        for (const p of pending) {
          for (const wt of p.worktrees) map.set(wt.path, wt);
          if (!p.visibleOnly) visibleOnly = false;
        }
        return {worktrees: Array.from(map.values()), visibleOnly};
      }
    );
  }

  // CoreBase
  get(): Readonly<State> { return this.state; }
  subscribe(fn: (s: Readonly<State>) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  start(): void {
    // Auto-refresh visible PRs
    this.intervalCleanup = startIntervalIfEnabled(() => {
      const invalid = this.state.visibleWorktrees.filter((p) => !this.cacheService.isValid(p));
      // Skip non-repo workspace headers; only refresh real worktrees
      const filtered = invalid.filter((p) => p.includes('-branches/'));
      if (filtered.length) {
        const wts = filtered.map((p) => ({project: this.inferProjectFromPath(p), path: p, is_archived: false as const}));
        this.throttledRefresh({worktrees: wts, visibleOnly: false});
      }
    }, this.refreshMs);
  }
  stop(): void {
    if (this.intervalCleanup) this.intervalCleanup();
    if (this.visibleDebounceCleanup) this.visibleDebounceCleanup();
    this.intervalCleanup = null;
    this.visibleDebounceCleanup = null;
  }

  // Public API (mirrors current context)
  async refreshPRStatus(worktrees: WT[], visibleOnly: boolean = false): Promise<void> {
    await this.refreshPRStatusInternal(worktrees, visibleOnly);
  }

  async refreshPRForWorktree(worktreePath: string): Promise<PRStatus | null> {
    // Cache first
    const cached = this.cacheService.get(worktreePath);
    if (cached) {
      this.setState({pullRequests: {...this.state.pullRequests, [worktreePath]: cached}, lastUpdated: Date.now()});
      return cached;
    }
    const prMap = await this.gitHubService.batchGetPRStatusForWorktreesAsync([{project: 'single', path: worktreePath, is_archived: false}], true);
    const pr = prMap[worktreePath];
    if (pr) {
      this.cacheService.set(worktreePath, pr);
      this.setState({pullRequests: {...this.state.pullRequests, [worktreePath]: pr}, lastUpdated: Date.now()});
      return pr;
    }
    return null;
  }

  async forceRefreshVisiblePRs(worktrees: {project: string; path: string; is_archived?: boolean}[]): Promise<void> {
    if (!worktrees.length) return;
    const paths = worktrees.map((w) => w.path);
    this.cacheService.invalidateMultiple(paths);
    await this.refreshPRStatusInternal(worktrees, false);
  }

  getPRStatus(worktreePath: string): PRStatus {
    let pr = this.state.pullRequests[worktreePath];
    if (!pr) {
      const cached = this.cacheService.get(worktreePath);
      if (cached) {
        pr = cached;
        this.setState({pullRequests: {...this.state.pullRequests, [worktreePath]: cached}});
      } else {
        pr = new PRStatus({loadingStatus: 'not_checked'});
      }
    }
    return pr;
  }


  setVisibleWorktrees(paths: string[]): void {
    this.setState({visibleWorktrees: paths});
    if (this.visibleDebounceCleanup) this.visibleDebounceCleanup();
    const run = () => {
      const toRefresh = paths.filter((p) => !this.cacheService.isValid(p));
      if (toRefresh.length) {
        const wts = toRefresh
          // Skip non-repo workspace headers
          .filter((p) => p.includes('-branches/'))
          .map((p) => ({project: this.inferProjectFromPath(p), path: p, is_archived: false as const}));
        if (wts.length) {
          // kick a refresh without requiring global intervals to be enabled
          void this.refreshPRStatusInternal(wts, false);
        }
      }
    };
    if (isAppIntervalsEnabled()) {
      this.visibleDebounceCleanup = startTimeoutIfEnabled(run, 200);
    } else {
      // Debounce once even when intervals are disabled
      const id = setTimeout(run, 200);
      this.visibleDebounceCleanup = () => clearTimeout(id);
    }
  }

  private inferProjectFromPath(pathname: string): string {
    // Expect structure: {base}/{project}-branches/{feature}
    // or {base}/{project}/ (fallback)
    const base = this.gitService.basePath.endsWith('/') ? this.gitService.basePath : this.gitService.basePath + '/';
    let rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
    const first = rest.split('/')[0] || '';
    if (first === 'workspaces') return 'workspace';
    if (first.endsWith('-branches')) return first.slice(0, -'-branches'.length);
    return first || 'unknown';
  }

  private hydrateFromCache(): void {
    try {
      const paths = this.cacheService.getCachedPaths?.() || [];
      if (!paths.length) return;
      const map: Record<string, PRStatus> = {} as any;
      for (const p of paths) {
        const pr = this.cacheService.get(p);
        if (pr && pr.loadingStatus !== 'not_checked' && pr.loadingStatus !== 'loading') {
          map[p] = pr;
        }
      }
      if (Object.keys(map).length) {
        this.setState({ pullRequests: { ...this.state.pullRequests, ...map }, lastUpdated: Date.now() });
      }
    } catch {}
  }

  async createPR(worktreePath: string, title: string, body?: string): Promise<boolean> {
    const ok = this.gitHubService.createPR(worktreePath, title, body);
    if (ok) {
      this.cacheService.invalidate(worktreePath);
      await this.refreshPRForWorktree(worktreePath);
    }
    return ok;
  }

  async mergePR(worktreePath: string, method: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<boolean> {
    const ok = this.gitHubService.mergePR(worktreePath, method);
    if (ok) {
      this.cacheService.invalidate(worktreePath);
      await this.refreshPRForWorktree(worktreePath);
    }
    return ok;
  }

  clearCache(): void { this.cacheService.clear(); this.setState({pullRequests: {}}); }
  getCacheStats(): {total: number; valid: number; expired: number} { return this.cacheService.getStats(); }

  // Internals
  private async refreshPRStatusInternal(worktrees: WT[], visibleOnly: boolean): Promise<void> {
    if (this.state.loading || worktrees.length === 0) return;
    const reqCount = worktrees.length;
    const toRefresh = worktrees.filter((wt) => !this.cacheService.isValid(wt.path) && (!visibleOnly || this.state.visibleWorktrees.includes(wt.path)));
    if (toRefresh.length === 0) {
      const cached: Record<string, PRStatus> = {};
      for (const wt of worktrees) {
        const pr = this.cacheService.get(wt.path);
        if (pr) cached[wt.path] = pr;
      }
      if (Object.keys(cached).length) this.setState({pullRequests: {...this.state.pullRequests, ...cached}, lastUpdated: Date.now()});
      console.log(`[${this.ts()}] [github-core] visible=${reqCount} cached-only=${Object.keys(cached).length}`);
      return;
    }
    this.setState({loading: true});
    try {
      console.log(`[${this.ts()}] [github-core] refreshing PRs: requested=${reqCount} toRefresh=${toRefresh.length}`);
      const prMap = await this.gitHubService.batchGetPRStatusForWorktreesAsync(toRefresh, true);
      const updates: Record<string, PRStatus> = {};
      for (const [p, pr] of Object.entries(prMap)) {
        updates[p] = pr;
        if (pr.loadingStatus !== 'error') this.cacheService.set(p, pr);
      }
      console.log(`[${this.ts()}] [github-core] updated PR entries: ${Object.keys(updates).length}`);
      this.setState({pullRequests: {...this.state.pullRequests, ...updates}, lastUpdated: Date.now()});
    } finally {
      this.setState({loading: false});
    }
  }

  private setState(partial: Partial<State>): void {
    this.state = Object.freeze({...this.state, ...partial});
    for (const l of this.listeners) l(this.state);
  }
}
