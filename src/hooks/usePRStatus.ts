import {useState, useCallback, useEffect} from 'react';
import {PRStatus} from '../models.js';
import {useGitService} from '../contexts/ServicesContext.js';
import {CacheService} from '../services/CacheService.js';

export interface PRStatusCache {
  [worktreePath: string]: PRStatus;
}

export function usePRStatus() {
  const gitService = useGitService();
  const [cache, setCache] = useState<PRStatusCache>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [cacheService] = useState(() => new CacheService());

  useEffect(() => {
    const cachedData = cacheService.getCachedPRs();
    if (Object.keys(cachedData).length > 0) {
      setCache(cachedData);
    }
  }, [cacheService]);

  const fetchPRStatus = useCallback(async (
    worktrees: Array<{project: string; path: string; is_archived?: boolean}>,
    includeChecks = true
  ): Promise<Record<string, PRStatus>> => {
    const paths = worktrees.map(w => w.path);
    const invalidatedPaths = cacheService.getInvalidatedPaths(paths);
    const invalidatedWorktrees = worktrees.filter(w => invalidatedPaths.includes(w.path));
    
    // Return cached data if nothing needs to be refreshed
    if (invalidatedWorktrees.length === 0) {
      const validCached = cacheService.getCachedPRs();
      const result: Record<string, PRStatus> = {};
      paths.forEach(path => {
        if (validCached[path]) result[path] = validCached[path];
      });
      return result;
    }

    setLoading(prev => new Set([...prev, ...invalidatedPaths]));

    try {
      const fetchedPRs = await gitService.batchGetPRStatusForWorktreesAsync(invalidatedWorktrees, includeChecks);
      
      setCache(prevCache => ({...prevCache, ...fetchedPRs}));
      cacheService.saveCache(fetchedPRs);

      // Combine fresh data with valid cached data
      const allCached = cacheService.getCachedPRs();
      const result: Record<string, PRStatus> = {};
      paths.forEach(path => {
        result[path] = fetchedPRs[path] || allCached[path] || new PRStatus();
      });

      return result;
    } catch {
      return {};
    } finally {
      setLoading(prev => {
        const newLoading = new Set(prev);
        invalidatedPaths.forEach(path => newLoading.delete(path));
        return newLoading;
      });
    }
  }, [gitService, cacheService]);

  const getPRStatus = useCallback((worktreePath: string): PRStatus | null => {
    return cache[worktreePath] || null;
  }, [cache]);

  const isPRStatusLoading = useCallback((worktreePath: string): boolean => {
    return loading.has(worktreePath);
  }, [loading]);

  const fetchSingleWorktreePRStatus = useCallback(async (
    project: string,
    path: string
  ): Promise<PRStatus | null> => {
    try {
      const result = await fetchPRStatus([{project, path}]);
      return result[path] || null;
    } catch {
      return null;
    }
  }, [fetchPRStatus]);

  const clearPRStatusCache = useCallback((worktreePath?: string) => {
    if (worktreePath) {
      setCache(prev => {
        const newCache = {...prev};
        delete newCache[worktreePath];
        return newCache;
      });
      cacheService.clearCache(worktreePath);
    } else {
      setCache({});
      cacheService.clearCache();
    }
  }, [cacheService]);

  const refreshNonMergedPRs = useCallback(async (
    worktrees: Array<{project: string; path: string; pr?: PRStatus}>
  ): Promise<Record<string, PRStatus>> => {
    const nonMergedWorktrees = worktrees.filter(w => !w.pr?.is_merged);
    if (nonMergedWorktrees.length === 0) return {};

    return await fetchPRStatus(nonMergedWorktrees, true);
  }, [fetchPRStatus]);

  const forceRefreshAllPRs = useCallback(async (
    worktrees: Array<{project: string; path: string}>
  ): Promise<Record<string, PRStatus>> => {
    // Clear entire cache to force fresh fetches
    clearPRStatusCache();
    
    // Fetch fresh data for all worktrees
    return await fetchPRStatus(worktrees, true);
  }, [fetchPRStatus, clearPRStatusCache]);

  return {
    cache,
    fetchPRStatus,
    getPRStatus,
    isPRStatusLoading,
    fetchSingleWorktreePRStatus,
    clearPRStatusCache,
    refreshNonMergedPRs,
    forceRefreshAllPRs
  };
}