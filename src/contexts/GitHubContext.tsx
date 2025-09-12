import React, {createContext, useContext, useCallback, ReactNode} from 'react';
import {PRStatus, WorktreeInfo} from '../models.js';
import {GitHubCore} from '../cores/GitHubCore.js';

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
  
  // Cache operations
  clearCache: () => void;
  getCacheStats: () => {total: number; valid: number; expired: number};
}

const GitHubContext = createContext<GitHubContextType | null>(null);

interface GitHubProviderProps { children: ReactNode; core?: GitHubCore; }

export function GitHubProvider({children, core: coreOverride}: GitHubProviderProps) {
  const coreRef = React.useRef(coreOverride || new GitHubCore());
  const core = coreRef.current;
  React.useEffect(() => { core.start(); return () => core.stop(); }, [core]);
  const state = React.useSyncExternalStore(core.subscribe.bind(core), core.get.bind(core), core.get.bind(core));

  const refreshPRStatus = useCallback(async (
    worktrees: WorktreeInfo[], 
    visibleOnly: boolean = false
  ): Promise<void> => core.refreshPRStatus(worktrees.map(w => ({project: w.project, path: w.path, is_archived: (w as any).is_archived || false})), visibleOnly)
  , [core]);

  const refreshPRForWorktree = useCallback(async (worktreePath: string): Promise<PRStatus | null> => core.refreshPRForWorktree(worktreePath), [core]);

  const forceRefreshVisiblePRs = useCallback(async (worktrees: WorktreeInfo[]): Promise<void> => core.forceRefreshVisiblePRs(worktrees.map(w => ({project: w.project, path: w.path, is_archived: (w as any).is_archived || false}))), [core]);

  const getPRStatus = useCallback((worktreePath: string): PRStatus => core.getPRStatus(worktreePath), [core]);

  const setVisibleWorktreesCallback = useCallback((worktreePaths: string[]) => { core.setVisibleWorktrees(worktreePaths); }, [core]);

  const createPR = useCallback(async (worktreePath: string, title: string, body?: string): Promise<boolean> => core.createPR(worktreePath, title, body), [core]);

  const mergePR = useCallback(async (worktreePath: string, method: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<boolean> => core.mergePR(worktreePath, method), [core]);

  const clearCache = useCallback(() => { core.clearCache(); }, [core]);

  const getCacheStats = useCallback(() => core.getCacheStats(), [core]);

  const contextValue: GitHubContextType = {
    // State
    pullRequests: state.pullRequests,
    loading: state.loading,
    lastUpdated: state.lastUpdated,
    
    // Operations
    refreshPRStatus,
    refreshPRForWorktree,
    forceRefreshVisiblePRs,
    getPRStatus,
    setVisibleWorktrees: setVisibleWorktreesCallback,
    
    // GitHub operations
    createPR,
    mergePR,
    
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
