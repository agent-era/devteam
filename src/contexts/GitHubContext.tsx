import React, {createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef, useMemo} from 'react';
import {PRStatus, WorktreeInfo} from '../models.js';
import {GitHubService} from '../services/GitHubService.js';
import {GitService} from '../services/GitService.js';
import {PRStatusCacheService} from '../services/PRStatusCacheService.js';
import {PR_REFRESH_DURATION} from '../constants.js';
import {getProjectsDirectory} from '../config.js';
import {logError, logDebug} from '../shared/utils/logger.js';
import {createThrottledBatch} from '../shared/utils/throttle.js';


interface GitHubContextType {
  // State
  pullRequests: Record<string, PRStatus>;
  loading: boolean;
  lastUpdated: number;
  
  // Operations
  refreshPRStatus: (worktrees: WorktreeInfo[], visibleOnly?: boolean) => Promise<void>;
  refreshPRForWorktree: (worktreePath: string) => Promise<PRStatus | null>;
  forceRefreshVisiblePRs: (worktrees: WorktreeInfo[]) => Promise<void>;
  getPRStatus: (worktreePath: string) => PRStatus;
  setVisibleWorktrees: (worktreePaths: string[]) => void;
  
  // GitHub operations
  createPR: (worktreePath: string, title: string, body?: string) => Promise<boolean>;
  mergePR: (worktreePath: string, method?: 'merge' | 'squash' | 'rebase') => Promise<boolean>;
  // getPRDetails removed - use getPRStatus for consistent PR data
  
  // Cache operations
  clearCache: () => void;
  getCacheStats: () => {total: number; valid: number; expired: number};
}

const GitHubContext = createContext<GitHubContextType | null>(null);

interface GitHubProviderProps {
  children: ReactNode;
  gitHubService?: GitHubService;
  gitService?: GitService;
}

export function GitHubProvider({children, gitHubService: ghOverride, gitService: gitOverride}: GitHubProviderProps) {
  const [pullRequests, setPullRequests] = useState<Record<string, PRStatus>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);
  const [visibleWorktrees, setVisibleWorktrees] = useState<string[]>([]);

  // Service instances (allow test overrides via globals)
  const gitHubService: GitHubService = useMemo(() => {
    if (ghOverride) return ghOverride;
    return new GitHubService();
  }, [ghOverride]);
  const gitService: GitService = useMemo(() => {
    if (gitOverride) return gitOverride;
    return new GitService(getProjectsDirectory());
  }, [gitOverride]);
  const cacheService = useRef(new PRStatusCacheService()).current;
  const refreshIntervalRef = useRef<NodeJS.Timeout>();

  // Load cached PR data on mount
  useEffect(() => {
    const cachedPaths = cacheService.getCachedPaths();
    const cached: Record<string, PRStatus> = {};
    
    for (const worktreePath of cachedPaths) {
      const cachedPR = cacheService.get(worktreePath);
      if (cachedPR) {
        cached[worktreePath] = cachedPR;
      }
    }
    
    if (Object.keys(cached).length > 0) {
      setPullRequests(cached);
      setLastUpdated(Date.now());
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [cacheService]);

  // startAutoRefresh defined after refreshPRStatusInternal

  const refreshPRStatusInternal = useCallback(async (
    worktrees: Array<{project: string; path: string; is_archived?: boolean}>,
    visibleOnly: boolean = false
  ): Promise<void> => {
    if (loading || worktrees.length === 0) return;
    
    // Filter worktrees based on cache validity and visibility
    const worktreesToRefresh = worktrees.filter(wt => {
      // Skip if cache is still valid
      if (cacheService.isValid(wt.path)) {
        return false;
      }
      
      // If visibleOnly, only refresh visible worktrees
      if (visibleOnly && !visibleWorktrees.includes(wt.path)) {
        return false;
      }
      
      return true;
    });

    if (worktreesToRefresh.length === 0) {
      // All requested worktrees are cached, just load from cache
      const cached: Record<string, PRStatus> = {};
      for (const wt of worktrees) {
        const cachedPR = cacheService.get(wt.path);
        if (cachedPR) {
          cached[wt.path] = cachedPR;
        }
      }
      
      logDebug(`PR refresh: ${worktrees.length} worktrees requested, 0 need refresh (${worktrees.length} cached)`);
      
      if (Object.keys(cached).length > 0) {
        setPullRequests(prev => ({...prev, ...cached}));
        setLastUpdated(Date.now());
      }
      return;
    }
    
    const cachedCount = worktrees.length - worktreesToRefresh.length;
    logDebug(`PR refresh: ${worktrees.length} worktrees requested, ${worktreesToRefresh.length} need refresh (${cachedCount} cached)`);
    
    setLoading(true);
    try {
      // Check for recently merged PRs via git history before API refresh
      await checkForMergedPRsViaGit(worktreesToRefresh);
      
      const prStatusMap: Record<string, PRStatus> = await gitHubService.batchGetPRStatusForWorktreesAsync(worktreesToRefresh, true);
      
      // Only cache and update state for successful responses
      const newPRs: Record<string, PRStatus> = {};
      const successfulPaths: string[] = [];
      const errorPaths: string[] = [];
      
      for (const [path, prStatus] of Object.entries(prStatusMap)) {
        if (prStatus.loadingStatus === 'error') {
          // Don't cache error states, just update in-memory state
          newPRs[path] = prStatus;
          errorPaths.push(path);
        } else {
          // Cache successful responses (exists, no_pr)
          cacheService.set(path, prStatus);
          newPRs[path] = prStatus;
          successfulPaths.push(path);
        }
      }
      
      setPullRequests(prev => ({...prev, ...newPRs}));
      setLastUpdated(Date.now());
      
      if (errorPaths.length > 0) {
        logError('PR status API errors occurred', {
          errorPaths,
          successfulPaths: successfulPaths.length,
          totalPaths: Object.keys(prStatusMap).length
        });
      }
    } catch (error) {
      logError('Failed to refresh PR status', { 
        error: error instanceof Error ? error.message : String(error),
        worktreePaths: worktreesToRefresh.map(wt => wt.path)
      });
      console.error('Failed to refresh PR status:', error);
    } finally {
      setLoading(false);
    }
  }, [loading, gitHubService, cacheService, visibleWorktrees]);

  // Throttle wrapper to avoid spamming GitHub; merges queued paths
  const throttledRefreshPR = useMemo(() => {
    type WT = {project: string; path: string; is_archived?: boolean};
    return createThrottledBatch<{worktrees: WT[]; visibleOnly: boolean}>(
      1000,
      async ({worktrees, visibleOnly}) => refreshPRStatusInternal(worktrees, visibleOnly),
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
  }, [refreshPRStatusInternal]);

  // Auto-refresh PRs for visible worktrees (restart on visibility/strategy change)
  useEffect(() => {
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    refreshIntervalRef.current = setInterval(() => {
      const paths = visibleWorktrees.filter(path => !cacheService.isValid(path));
      if (paths.length > 0) {
        const worktreesToRefresh = paths.map(path => ({
          project: 'auto-refresh',
          path,
          is_archived: false
        }));
        throttledRefreshPR({worktrees: worktreesToRefresh, visibleOnly: false});
      }
    }, PR_REFRESH_DURATION);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [visibleWorktrees, cacheService, throttledRefreshPR]);

  // Immediately refresh stale PRs for the current visible set (no need to wait for the interval)
  useEffect(() => {
    if (!visibleWorktrees || visibleWorktrees.length === 0) return;
    const paths = visibleWorktrees.filter(path => !cacheService.isValid(path));
    if (paths.length === 0) return;
    const worktreesToRefresh = paths.map(path => ({
      project: 'visible-now',
      path,
      is_archived: false
    }));
    throttledRefreshPR({worktrees: worktreesToRefresh, visibleOnly: false});
  }, [visibleWorktrees, cacheService, throttledRefreshPR]);

  const refreshPRStatus = useCallback(async (
    worktrees: WorktreeInfo[], 
    visibleOnly: boolean = false
  ): Promise<void> => {
    return refreshPRStatusInternal(worktrees, visibleOnly);
  }, [refreshPRStatusInternal]);

  const checkForMergedPRsViaGit = useCallback(async (
    worktrees: Array<{project: string; path: string; is_archived?: boolean}>
  ): Promise<void> => {
    // Group worktrees by project to batch git operations
    const projectGroups: Record<string, Array<{project: string; path: string}>> = {};
    
    for (const wt of worktrees) {
      if (!wt.is_archived) {
        if (!projectGroups[wt.project]) projectGroups[wt.project] = [];
        projectGroups[wt.project].push({project: wt.project, path: wt.path});
      }
    }
    
    for (const [project, group] of Object.entries(projectGroups)) {
      if (!group.length) continue;
      
      const repoPath = group[0].path;
      
      try {
        // Only check for open PRs with passing checks (likely to be merged)
        const openPassingPRs = group
          .map(wt => ({...wt, pr: pullRequests[wt.path]}))
          .filter(wt => wt.pr && wt.pr.state === 'OPEN' && wt.pr.checks === 'passing');
        
        if (openPassingPRs.length === 0) continue;
        
        // Fetch latest main/master branch
        await gitService.fetchMainBranch(repoPath);
        
        // Look for merged PRs in recent history
        const mergedPRNumbers = await gitService.findMergedPRsInHistory(repoPath, 20);
        
        // Invalidate cache for any PRs found to be merged
        for (const wt of openPassingPRs) {
          if (wt.pr?.number && mergedPRNumbers.includes(wt.pr.number)) {
            logDebug(`Found merged PR #${wt.pr.number} via git history, invalidating cache`);
            cacheService.invalidateByPRNumber(wt.pr.number);
          }
        }
      } catch (error) {
        // Silent failure - git operations are not critical
        logError('Failed to check for merged PRs via git', {project, error});
      }
    }
  }, [gitService, pullRequests, cacheService]);

  const refreshPRForWorktree = useCallback(async (worktreePath: string): Promise<PRStatus | null> => {
    try {
      // Check cache first
      const cached = cacheService.get(worktreePath);
      if (cached) {
        setPullRequests(prev => ({...prev, [worktreePath]: cached}));
        return cached;
      }

      // For single worktree refresh, we need to create a minimal worktree object
      const dummyWorktree = {
        project: 'single-refresh',
        path: worktreePath,
        is_archived: false
      };
      
      const result: Record<string, PRStatus> = await gitHubService.batchGetPRStatusForWorktreesAsync([dummyWorktree], true);
      const prStatus: PRStatus | undefined = result[worktreePath];
      
      if (prStatus) {
        cacheService.set(worktreePath, prStatus);
        setPullRequests(prev => ({
          ...prev,
          [worktreePath]: prStatus
        }));
      }
      
      return prStatus || null;
    } catch (error) {
      console.error('Failed to refresh PR for worktree:', error);
      return null;
    }
  }, [gitHubService, cacheService]);

  const forceRefreshVisiblePRs = useCallback(async (worktrees: WorktreeInfo[]): Promise<void> => {
    if (loading || worktrees.length === 0) return;
    
    // Extract worktree paths
    const worktreePaths = worktrees.map(wt => wt.path);
    
    // Invalidate cache for these specific worktrees
    cacheService.invalidateMultiple(worktreePaths);
    
    // Force refresh by calling the internal refresh method
    // Convert WorktreeInfo to the minimal format expected by refreshPRStatusInternal
    const minimalWorktrees = worktrees.map(wt => ({
      project: wt.project,
      path: wt.path,
      is_archived: wt.is_archived || false
    }));
    
    await refreshPRStatusInternal(minimalWorktrees, false);
  }, [loading, cacheService, refreshPRStatusInternal]);

  const getPRStatus = useCallback((worktreePath: string): PRStatus => {
    // Always return a PRStatus object, never null/undefined
    let prStatus = pullRequests[worktreePath];
    
    if (!prStatus) {
      const cachedStatus = cacheService.get(worktreePath);
      if (cachedStatus) {
        // Load from cache into memory
        prStatus = cachedStatus;
        setPullRequests(prev => ({...prev, [worktreePath]: cachedStatus}));
      } else {
        // Return "not_checked" status if nothing found
        prStatus = new PRStatus({ loadingStatus: 'not_checked' });
      }
    }
    
    return prStatus;
  }, [pullRequests, cacheService]);

  const setVisibleWorktreesCallback = useCallback((worktreePaths: string[]) => {
    setVisibleWorktrees(worktreePaths);
  }, []);

  const createPR = useCallback(async (worktreePath: string, title: string, body?: string): Promise<boolean> => {
    try {
      const success = gitHubService.createPR(worktreePath, title, body);
      if (success) {
        // Invalidate cache and refresh PR status for this worktree after creating
        cacheService.invalidate(worktreePath);
        await refreshPRForWorktree(worktreePath);
      }
      return success;
    } catch (error) {
      console.error('Failed to create PR:', error);
      return false;
    }
  }, [gitHubService, cacheService, refreshPRForWorktree]);

  const mergePR = useCallback(async (worktreePath: string, method: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<boolean> => {
    try {
      const success = gitHubService.mergePR(worktreePath, method);
      if (success) {
        // Invalidate cache and refresh PR status for this worktree after merging
        cacheService.invalidate(worktreePath);
        await refreshPRForWorktree(worktreePath);
      }
      return success;
    } catch (error) {
      console.error('Failed to merge PR:', error);
      return false;
    }
  }, [gitHubService, cacheService, refreshPRForWorktree]);

  // getPRDetails method removed - use getPRStatus for consistent PR data

  const clearCache = useCallback(() => {
    cacheService.clear();
    setPullRequests({});
  }, [cacheService]);

  const getCacheStats = useCallback(() => {
    return cacheService.getStats();
  }, [cacheService]);

  const contextValue: GitHubContextType = {
    // State
    pullRequests,
    loading,
    lastUpdated,
    
    // Operations
    refreshPRStatus,
    refreshPRForWorktree,
    forceRefreshVisiblePRs,
    getPRStatus,
    setVisibleWorktrees: setVisibleWorktreesCallback,
    
    // GitHub operations
    createPR,
    mergePR,
    // getPRDetails removed
    
    // Cache operations
    clearCache,
    getCacheStats
  };

  return (
    <GitHubContext.Provider value={contextValue}>
      {children}
    </GitHubContext.Provider>
  );
}

export function useGitHubContext(): GitHubContextType {
  const context = useContext(GitHubContext);
  if (!context) {
    throw new Error('useGitHubContext must be used within a GitHubProvider');
  }
  return context;
}
