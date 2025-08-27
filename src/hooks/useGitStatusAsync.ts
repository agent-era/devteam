import {useState, useCallback} from 'react';
import {GitStatus} from '../models.js';
import {useGitService} from '../contexts/ServicesContext.js';

export interface GitStatusCache {
  [worktreePath: string]: GitStatus;
}

export function useGitStatusAsync() {
  const gitService = useGitService();
  const [cache, setCache] = useState<GitStatusCache>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const fetchGitStatus = useCallback(async (
    worktreePath: string
  ): Promise<GitStatus | null> => {
    const loadingPaths = new Set([...loading, worktreePath]);
    setLoading(loadingPaths);

    try {
      const result = await gitService.getGitStatusAsync(worktreePath);
      
      setCache(prevCache => ({
        ...prevCache,
        [worktreePath]: result
      }));

      return result;
    } catch (error) {
      console.error('Failed to fetch git status:', error);
      return null;
    } finally {
      setLoading(prev => {
        const newLoading = new Set(prev);
        newLoading.delete(worktreePath);
        return newLoading;
      });
    }
  }, [gitService, loading]);

  const batchFetchGitStatus = useCallback(async (
    worktreePaths: string[]
  ): Promise<Record<string, GitStatus>> => {
    const loadingPaths = new Set([...loading, ...worktreePaths]);
    setLoading(loadingPaths);

    try {
      const results = await Promise.all(
        worktreePaths.map(path => 
          gitService.getGitStatusAsync(path)
            .then(status => ({path, status}))
            .catch(() => ({path, status: null}))
        )
      );

      const newStatuses: Record<string, GitStatus> = {};
      results.forEach(({path, status}) => {
        if (status) {
          newStatuses[path] = status;
        }
      });
      
      setCache(prevCache => ({
        ...prevCache,
        ...newStatuses
      }));

      return newStatuses;
    } catch (error) {
      console.error('Failed to batch fetch git status:', error);
      return {};
    } finally {
      setLoading(prev => {
        const newLoading = new Set(prev);
        worktreePaths.forEach(path => newLoading.delete(path));
        return newLoading;
      });
    }
  }, [gitService, loading]);

  const getGitStatus = useCallback((worktreePath: string): GitStatus | null => {
    return cache[worktreePath] || null;
  }, [cache]);

  const isGitStatusLoading = useCallback((worktreePath: string): boolean => {
    return loading.has(worktreePath);
  }, [loading]);

  const clearGitStatusCache = useCallback((worktreePath?: string) => {
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

  return {
    fetchGitStatus,
    batchFetchGitStatus,
    getGitStatus,
    isGitStatusLoading,
    clearGitStatusCache,
    cache
  };
}