import {useState, useCallback} from 'react';
import {PRStatus} from '../models.js';
import {useGitService} from '../contexts/ServicesContext.js';

export interface PRStatusCache {
  [worktreePath: string]: PRStatus;
}

export function usePRStatus() {
  const gitService = useGitService();
  const [cache, setCache] = useState<PRStatusCache>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const fetchPRStatus = useCallback(async (
    worktrees: Array<{project: string; path: string; is_archived?: boolean}>,
    includeChecks = true
  ): Promise<Record<string, PRStatus>> => {
    const paths = worktrees.map(w => w.path);
    const loadingPaths = new Set([...loading, ...paths]);
    setLoading(loadingPaths);

    try {
      const result = await gitService.batchGetPRStatusForWorktreesAsync(worktrees, includeChecks);
      
      setCache(prevCache => ({
        ...prevCache,
        ...result
      }));

      return result;
    } catch (error) {
      console.error('Failed to fetch PR status:', error);
      return {};
    } finally {
      setLoading(prev => {
        const newLoading = new Set(prev);
        paths.forEach(path => newLoading.delete(path));
        return newLoading;
      });
    }
  }, [gitService, loading]);

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
    } else {
      setCache({});
    }
  }, []);

  const refreshNonMergedPRs = useCallback(async (
    worktrees: Array<{project: string; path: string; pr?: PRStatus}>
  ): Promise<Record<string, PRStatus>> => {
    const nonMergedWorktrees = worktrees.filter(w => !w.pr?.is_merged);
    if (nonMergedWorktrees.length === 0) return {};

    return await fetchPRStatus(nonMergedWorktrees, true);
  }, [fetchPRStatus]);

  return {
    cache,
    fetchPRStatus,
    getPRStatus,
    isPRStatusLoading,
    fetchSingleWorktreePRStatus,
    clearPRStatusCache,
    refreshNonMergedPRs
  };
}