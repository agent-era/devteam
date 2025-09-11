import React, {createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef, useMemo} from 'react';
import {PRStatus, WorktreeInfo} from '../models.js';
import {useWorktreeContext} from './WorktreeContext.js';
import {GitHubService} from '../services/GitHubService.js';
import {GitService} from '../services/GitService.js';
import {getProjectsDirectory} from '../config.js';

interface GitHubContextType {
  pullRequests: Record<string, PRStatus>;
  loading: boolean;
  lastUpdated: number;
  refreshPRStatus: (worktrees: WorktreeInfo[], visibleOnly?: boolean) => Promise<void>;
  refreshPRForWorktree: (worktreePath: string) => Promise<PRStatus | null>;
  forceRefreshVisiblePRs: (worktrees: WorktreeInfo[]) => Promise<void>;
  getPRStatus: (worktreePath: string) => PRStatus;
  setVisibleWorktrees: (worktreePaths: string[]) => void;
  createPR: (worktreePath: string, title: string, body?: string) => Promise<boolean>;
  mergePR: (worktreePath: string, method?: 'merge' | 'squash' | 'rebase') => Promise<boolean>;
  clearCache: () => void;
  getCacheStats: () => {total: number; valid: number; expired: number};
}

const GitHubContext = createContext<GitHubContextType | null>(null);

interface GitHubProviderProps { children: ReactNode; gitHubService?: GitHubService; gitService?: GitService; }

export function GitHubProvider({children, gitHubService: ghOverride, gitService: gitOverride}: GitHubProviderProps) {
  const [pullRequests, setPullRequests] = useState<Record<string, PRStatus>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);
  const [visibleWorktrees, setVisibleWorktrees] = useState<string[]>([]);

  const {getEngine} = useWorktreeContext();
  const engineRef = useRef<ReturnType<typeof getEngine> | null>(null);
  const gitHubService: GitHubService = useMemo(() => ghOverride || new GitHubService(), [ghOverride]);
  const gitService: GitService = useMemo(() => gitOverride || new GitService(getProjectsDirectory()), [gitOverride]);

  useEffect(() => {
    const eng = getEngine();
    engineRef.current = eng;
    if (!eng) return;
    const update = () => {
      try {
        const map = (eng as any).getPRMap?.() as Record<string, PRStatus> | undefined;
        if (map) { setPullRequests(map); setLastUpdated(Date.now()); }
      } catch {}
    };
    update();
    // Ensure a single refresh on startup to warm caches
    try { (eng as any).refreshProgressive?.(); } catch {}
    const handler = () => update();
    (eng as any).on?.('snapshot', handler);
    return () => { try { (eng as any).off?.('snapshot', handler); } catch {} };
  }, [getEngine]);

  const refreshPRStatusInternal = useCallback(async (): Promise<void> => {
    if (loading) return;
    try {
      setLoading(true);
      await (engineRef.current as any)?.refreshProgressive?.();
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const refreshPRStatus = useCallback(async (worktrees: WorktreeInfo[], visibleOnly: boolean = false): Promise<void> => {
    void visibleOnly; void worktrees; // engine handles visibility
    return refreshPRStatusInternal();
  }, [refreshPRStatusInternal]);

  const refreshPRForWorktree = useCallback(async (worktreePath: string): Promise<PRStatus | null> => {
    void worktreePath;
    await refreshPRStatusInternal();
    return pullRequests[worktreePath] || new PRStatus({loadingStatus: 'not_checked'});
  }, [refreshPRStatusInternal, pullRequests]);

  const forceRefreshVisiblePRs = useCallback(async (worktrees: WorktreeInfo[]): Promise<void> => {
    void worktrees;
    await refreshPRStatusInternal();
  }, [refreshPRStatusInternal]);

  const getPRStatus = useCallback((worktreePath: string): PRStatus => {
    return pullRequests[worktreePath] || new PRStatus({ loadingStatus: 'not_checked' });
  }, [pullRequests]);

  const createPR = useCallback(async (worktreePath: string, title: string, body?: string): Promise<boolean> => {
    try {
      const success = gitHubService.createPR(worktreePath, title, body);
      if (success) await (engineRef.current as any)?.refreshProgressive?.();
      return success;
    } catch (error) {
      console.error('Failed to create PR:', error);
      return false;
    }
  }, [gitHubService]);

  const mergePR = useCallback(async (worktreePath: string, method: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<boolean> => {
    try {
      const success = gitHubService.mergePR(worktreePath, method);
      if (success) await (engineRef.current as any)?.refreshProgressive?.();
      return success;
    } catch (error) {
      console.error('Failed to merge PR:', error);
      return false;
    }
  }, [gitHubService]);

  const clearCache = useCallback(() => { setPullRequests({}); }, []);
  const getCacheStats = useCallback(() => {
    const total = Object.keys(pullRequests).length; return {total, valid: total, expired: 0};
  }, [pullRequests]);

  const contextValue: GitHubContextType = {
    pullRequests,
    loading,
    lastUpdated,
    refreshPRStatus,
    refreshPRForWorktree,
    forceRefreshVisiblePRs,
    getPRStatus,
    setVisibleWorktrees: setVisibleWorktrees,
    createPR,
    mergePR,
    clearCache,
    getCacheStats,
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
