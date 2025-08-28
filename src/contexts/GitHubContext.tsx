import React, {createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef} from 'react';
import {PRStatus, WorktreeInfo} from '../models.js';
import {GitHubService} from '../services/GitHubService.js';
import {PRStatusCacheService} from '../services/PRStatusCacheService.js';
import {PR_REFRESH_DURATION} from '../constants.js';
import {logError, logInfo} from '../shared/utils/logger.js';

const h = React.createElement;

interface GitHubContextType {
  // State
  pullRequests: Record<string, PRStatus>;
  loading: boolean;
  lastUpdated: number;
  
  // Operations
  refreshPRStatus: (worktrees: WorktreeInfo[], visibleOnly?: boolean) => Promise<void>;
  refreshPRForWorktree: (worktreePath: string) => Promise<PRStatus | null>;
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
}

export function GitHubProvider({children}: GitHubProviderProps) {
  const [pullRequests, setPullRequests] = useState<Record<string, PRStatus>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);
  const [visibleWorktrees, setVisibleWorktrees] = useState<string[]>([]);

  // Service instances
  const gitHubService = new GitHubService();
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

    // Start automatic refresh cycle
    startAutoRefresh();

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [cacheService]);

  const startAutoRefresh = useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    refreshIntervalRef.current = setInterval(() => {
      // Auto-refresh only for non-merged PRs that need updates
      const paths = Object.keys(pullRequests).filter(path => {
        const pr = pullRequests[path];
        return pr && !pr.is_merged && !cacheService.isValid(path);
      });

      if (paths.length > 0) {
        // Create minimal worktree objects for refresh
        const worktreesToRefresh = paths.map(path => ({
          project: 'auto-refresh',
          path,
          is_archived: false
        }));
        
        refreshPRStatusInternal(worktreesToRefresh, false);
      }
    }, PR_REFRESH_DURATION);
  }, [pullRequests, cacheService]);

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
      
      logInfo(`PR refresh: ${worktrees.length} worktrees requested, 0 need refresh (${worktrees.length} cached)`);
      
      if (Object.keys(cached).length > 0) {
        setPullRequests(prev => ({...prev, ...cached}));
        setLastUpdated(Date.now());
      }
      return;
    }
    
    const cachedCount = worktrees.length - worktreesToRefresh.length;
    logInfo(`PR refresh: ${worktrees.length} worktrees requested, ${worktreesToRefresh.length} need refresh (${cachedCount} cached)`);
    
    setLoading(true);
    try {
      const prStatusMap = await gitHubService.batchGetPRStatusForWorktreesAsync(worktreesToRefresh, true);
      
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

  const refreshPRStatus = useCallback(async (
    worktrees: WorktreeInfo[], 
    visibleOnly: boolean = false
  ): Promise<void> => {
    return refreshPRStatusInternal(worktrees, visibleOnly);
  }, [refreshPRStatusInternal]);

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
      
      const result = await gitHubService.batchGetPRStatusForWorktreesAsync([dummyWorktree], true);
      const prStatus = result[worktreePath];
      
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

  return h(GitHubContext.Provider, {value: contextValue}, children);
}

export function useGitHubContext(): GitHubContextType {
  const context = useContext(GitHubContext);
  if (!context) {
    throw new Error('useGitHubContext must be used within a GitHubProvider');
  }
  return context;
}