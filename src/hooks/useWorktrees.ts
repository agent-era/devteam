import {useEffect, useCallback} from 'react';
import {WorktreeInfo} from '../models.js';
import {useServices} from '../contexts/ServicesContext.js';
import {useAppState} from '../contexts/AppStateContext.js';
import {runCommandQuick} from '../utils.js';
import {
  CACHE_DURATION,
  AI_STATUS_REFRESH_DURATION,
  DIFF_STATUS_REFRESH_DURATION,
  PR_REFRESH_DURATION,
  GIT_REFRESH_DURATION,
} from '../constants.js';

function useInterval(callback: () => void, delay: number) {
  useEffect(() => {
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, [callback, delay]);
}

export function useWorktrees() {
  const {gitService, tmuxService} = useServices();
  const {state, setState} = useAppState();

  const collectWorktrees = useCallback((): Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string; 
    mtime?: number
  }> => {
    const projects = gitService.discoverProjects();
    const rows = [];
    for (const project of projects) {
      const worktrees = gitService.getWorktreesForProject(project);
      for (const wt of worktrees) rows.push(wt);
    }
    return rows;
  }, [gitService]);

  const attachRuntimeData = useCallback((list: Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string
  }>): WorktreeInfo[] => {
    return list.map((w: any) => {
      const gitStatus = gitService.getGitStatus(w.path);
      const sessionName = tmuxService.sessionName(w.project, w.feature);
      const activeSessions = tmuxService.listSessions();
      const attached = activeSessions.includes(sessionName);
      const claudeStatus = attached ? tmuxService.getClaudeStatus(sessionName) : 'not_running';
      
      let lastCommitTimestamp = 0;
      const timestampOutput = runCommandQuick(['git', '-C', w.path, 'log', '-1', '--format=%ct']);
      if (timestampOutput) {
        const parsedTimestamp = Number(timestampOutput.trim());
        if (!Number.isNaN(parsedTimestamp)) lastCommitTimestamp = parsedTimestamp;
      }
      
      return new WorktreeInfo({
        project: w.project,
        feature: w.feature,
        path: w.path,
        branch: w.branch,
        git: gitStatus,
        session: {
          session_name: sessionName, 
          attached, 
          claude_status: claudeStatus
        },
        pr: undefined,
        mtime: (w as any).mtime || 0,
        last_commit_ts: lastCommitTimestamp,
      });
    });
  }, [gitService, tmuxService]);

  const refreshAIStatus = useCallback((worktrees: WorktreeInfo[]): WorktreeInfo[] => {
    return worktrees.map(w => {
      const sessionName = tmuxService.sessionName(w.project, w.feature);
      const activeSessions = tmuxService.listSessions();
      const attached = activeSessions.includes(sessionName);
      const claudeStatus = attached ? tmuxService.getClaudeStatus(sessionName) : 'not_running';
      
      return new WorktreeInfo({
        ...w,
        session: {session_name: sessionName, attached, claude_status: claudeStatus}
      });
    });
  }, [tmuxService]);

  const refreshDiffStatus = useCallback((worktrees: WorktreeInfo[]): WorktreeInfo[] => {
    return worktrees.map(w => {
      const gitStatus = gitService.getGitStatus(w.path);
      return new WorktreeInfo({...w, git: gitStatus});
    });
  }, [gitService]);

  const mergeWorktreesPreservingData = useCallback((
    newWorktrees: WorktreeInfo[], 
    existingWorktrees: WorktreeInfo[]
  ): WorktreeInfo[] => {
    const existingMap = new Map<string, WorktreeInfo>();
    for (const wt of existingWorktrees) {
      existingMap.set(wt.path, wt);
    }
    
    return newWorktrees.map(newWt => {
      const existing = existingMap.get(newWt.path);
      if (existing) {
        return new WorktreeInfo({
          ...newWt,
          pr: existing.pr || newWt.pr
        });
      }
      return newWt;
    });
  }, []);

  const sortWorktrees = useCallback((worktrees: WorktreeInfo[]): WorktreeInfo[] => {
    return worktrees.slice().sort((a, b) => {
      const timestampA = (a.last_commit_ts && a.last_commit_ts > 0 ? a.last_commit_ts : (a.mtime || 0));
      const timestampB = (b.last_commit_ts && b.last_commit_ts > 0 ? b.last_commit_ts : (b.mtime || 0));
      return timestampB - timestampA; // descending
    });
  }, []);

  const refreshWorktrees = useCallback(() => {
    const worktreeList = collectWorktrees();
    const wtInfos = sortWorktrees(attachRuntimeData(worktreeList));
    const rows = process.stdout.rows || 24;
    const pageSize = Math.max(1, rows - 3);
    
    setState(s => ({
      ...s, 
      worktrees: wtInfos, 
      lastRefreshedAt: Date.now(), 
      pageSize
    }));

    // Async PR status fetch
    Promise.resolve().then(async () => {
      try {
        const prMap = await gitService.batchGetPRStatusForWorktreesAsync(
          wtInfos.map(w => ({project: w.project, path: w.path})), 
          true
        );
        const withPr = sortWorktrees(wtInfos.map(w => 
          new WorktreeInfo({...w, pr: prMap[w.path] || w.pr})
        ));
        setState(s => ({...s, worktrees: withPr}));
      } catch {}
    });
  }, [collectWorktrees, sortWorktrees, attachRuntimeData, setState, gitService]);

  // Initial load
  useEffect(() => {
    refreshWorktrees();
  }, [refreshWorktrees]);

  // AI status refresh every 2 seconds
  useInterval(() => {
    setState(s => ({
      ...s,
      worktrees: sortWorktrees(refreshAIStatus(s.worktrees)),
    }));
  }, AI_STATUS_REFRESH_DURATION);

  // Diff status refresh every 2 seconds
  useInterval(() => {
    setState(s => ({
      ...s,
      worktrees: sortWorktrees(refreshDiffStatus(s.worktrees)),
    }));
  }, DIFF_STATUS_REFRESH_DURATION);

  // Async git status refresh every 5 seconds (includes conflict detection)
  useInterval(() => {
    (async () => {
      const currentWorktrees = state.worktrees;
      if (!currentWorktrees.length) return;
      
      try {
        // Fetch git status for all worktrees with clean working trees
        const statusPromises = currentWorktrees.map(async w => {
          // Only check conflicts for worktrees with clean working trees
          if (!w.git?.has_changes) {
            const status = await gitService.getGitStatusAsync(w.path);
            return {path: w.path, status};
          }
          return {path: w.path, status: null};
        });
        
        const results = await Promise.all(statusPromises);
        const statusMap: Record<string, any> = {};
        results.forEach(({path, status}) => {
          if (status) statusMap[path] = status;
        });
        
        const updated = currentWorktrees.map(w => {
          const newStatus = statusMap[w.path];
          if (newStatus) {
            return new WorktreeInfo({...w, git: newStatus});
          }
          return w;
        });
        
        setState(s => ({...s, worktrees: sortWorktrees(updated)}));
      } catch {}
    })();
  }, GIT_REFRESH_DURATION);

  // PR refresh every 30s for non-merged PRs only
  useInterval(() => {
    (async () => {
      const currentWorktrees = state.worktrees;
      if (!currentWorktrees.length) return;
      
      try {
        const nonMergedWorktrees = currentWorktrees.filter(w => !w.pr?.is_merged);
        if (nonMergedWorktrees.length === 0) return;
        
        const prMap = await gitService.batchGetPRStatusForWorktreesAsync(
          nonMergedWorktrees.map(w => ({project: w.project, path: w.path})), 
          true
        );
        
        const updated = currentWorktrees.map(w => {
          if (nonMergedWorktrees.some(nw => nw.path === w.path)) {
            return new WorktreeInfo({...w, pr: prMap[w.path] || w.pr});
          }
          return w;
        });
        
        setState(s => ({...s, worktrees: sortWorktrees(updated)}));
      } catch {}
    })();
  }, PR_REFRESH_DURATION);

  // Full discovery refresh
  useInterval(() => {
    const worktreeList = collectWorktrees();
    const freshWtInfos = attachRuntimeData(worktreeList);
    
    setState(s => {
      const merged = sortWorktrees(mergeWorktreesPreservingData(freshWtInfos, s.worktrees));
      return {...s, worktrees: merged, lastRefreshedAt: Date.now()};
    });
    
    // Async PR status update
    Promise.resolve().then(async () => {
      try {
        const prMap = await gitService.batchGetPRStatusForWorktreesAsync(
          freshWtInfos.map(w => ({project: w.project, path: w.path})), 
          true
        );
        
        setState(s => {
          const withPr = s.worktrees.map(w => {
            const prData = prMap[w.path];
            return prData ? new WorktreeInfo({...w, pr: prData}) : w;
          });
          return {...s, worktrees: sortWorktrees(withPr)};
        });
      } catch {}
    });
    
    // Clean up orphaned tmux sessions
    try { 
      tmuxService.cleanupOrphanedSessions(freshWtInfos.map(w => w.path)); 
    } catch {}
  }, CACHE_DURATION);

  return {
    worktrees: state.worktrees,
    refreshWorktrees,
    selectedIndex: state.selectedIndex,
    page: state.page,
    pageSize: state.pageSize,
    lastRefreshedAt: state.lastRefreshedAt
  };
}