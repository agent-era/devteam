import React, {createContext, useContext, useState, useCallback, useEffect, ReactNode} from 'react';
import {PRStatus, WorktreeInfo} from '../models.js';
import {GitHubService} from '../services/GitHubService.js';
import {PR_REFRESH_DURATION} from '../constants.js';

const h = React.createElement;

interface GitHubContextType {
  // State
  pullRequests: Record<string, PRStatus>;
  loading: boolean;
  lastUpdated: number;
  
  // Operations
  refreshPRStatus: (worktrees: WorktreeInfo[]) => Promise<void>;
  refreshPRForWorktree: (worktreePath: string) => Promise<PRStatus | null>;
  getPRStatus: (worktreePath: string) => PRStatus | null;
  
  // GitHub operations
  createPR: (worktreePath: string, title: string, body?: string) => Promise<boolean>;
  mergePR: (worktreePath: string, method?: 'merge' | 'squash' | 'rebase') => Promise<boolean>;
  getPRDetails: (worktreePath: string) => any | null;
}

const GitHubContext = createContext<GitHubContextType | null>(null);

interface GitHubProviderProps {
  children: ReactNode;
}

export function GitHubProvider({children}: GitHubProviderProps) {
  const [pullRequests, setPullRequests] = useState<Record<string, PRStatus>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);

  // Service instance
  const gitHubService = new GitHubService();

  const refreshPRStatus = useCallback(async (worktrees: WorktreeInfo[]): Promise<void> => {
    if (loading || worktrees.length === 0) return;
    
    setLoading(true);
    try {
      const prStatusMap = await gitHubService.batchGetPRStatusForWorktreesAsync(worktrees, true);
      setPullRequests(prev => ({...prev, ...prStatusMap}));
      setLastUpdated(Date.now());
    } catch (error) {
      console.error('Failed to refresh PR status:', error);
    } finally {
      setLoading(false);
    }
  }, [loading, gitHubService]);

  const refreshPRForWorktree = useCallback(async (worktreePath: string): Promise<PRStatus | null> => {
    try {
      // For single worktree refresh, we need to create a minimal worktree object
      const dummyWorktree = {
        project: 'dummy',
        path: worktreePath,
        is_archived: false
      };
      
      const result = await gitHubService.batchGetPRStatusForWorktreesAsync([dummyWorktree], true);
      const prStatus = result[worktreePath];
      
      if (prStatus) {
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
  }, [gitHubService]);

  const getPRStatus = useCallback((worktreePath: string): PRStatus | null => {
    return pullRequests[worktreePath] || null;
  }, [pullRequests]);

  const createPR = useCallback(async (worktreePath: string, title: string, body?: string): Promise<boolean> => {
    try {
      const success = gitHubService.createPR(worktreePath, title, body);
      if (success) {
        // Refresh PR status for this worktree after creating
        await refreshPRForWorktree(worktreePath);
      }
      return success;
    } catch (error) {
      console.error('Failed to create PR:', error);
      return false;
    }
  }, [gitHubService, refreshPRForWorktree]);

  const mergePR = useCallback(async (worktreePath: string, method: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<boolean> => {
    try {
      const success = gitHubService.mergePR(worktreePath, method);
      if (success) {
        // Refresh PR status for this worktree after merging
        await refreshPRForWorktree(worktreePath);
      }
      return success;
    } catch (error) {
      console.error('Failed to merge PR:', error);
      return false;
    }
  }, [gitHubService, refreshPRForWorktree]);

  const getPRDetails = useCallback((worktreePath: string) => {
    return gitHubService.getPRForWorktree(worktreePath);
  }, [gitHubService]);

  const contextValue: GitHubContextType = {
    // State
    pullRequests,
    loading,
    lastUpdated,
    
    // Operations
    refreshPRStatus,
    refreshPRForWorktree,
    getPRStatus,
    
    // GitHub operations
    createPR,
    mergePR,
    getPRDetails
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