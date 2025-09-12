import React, {createContext, useContext, useCallback, ReactNode} from 'react';
import {WorktreeInfo} from '../models.js';
import type {AITool} from '../models.js';
import {MemoryStatus} from '../services/MemoryMonitorService.js';
import type {VersionInfo} from '../services/versionTypes.js';
import {WorktreeCore} from '../engine/cores/WorktreeCore.js';

interface WorktreeContextType {
  // State
  worktrees: WorktreeInfo[];
  loading: boolean;
  lastRefreshed: number;
  selectedIndex: number;
  memoryStatus: MemoryStatus | null;
  versionInfo: VersionInfo | null;
  
  // Navigation
  selectWorktree: (index: number) => void;
  getSelectedWorktree: () => WorktreeInfo | null;
  
  // Data operations
  refresh: (refreshPRs?: 'all' | 'visible' | 'none') => Promise<void>;
  refreshVisibleStatus: (currentPage: number, pageSize: number) => Promise<void>;
  forceRefreshVisible: (currentPage: number, pageSize: number) => Promise<void>;
  
  // Worktree operations
  createFeature: (projectName: string, featureName: string) => Promise<WorktreeInfo | null>;
  createFromBranch: (project: string, remoteBranch: string, localName: string) => Promise<boolean>;
  archiveFeature: (worktreeOrProject: WorktreeInfo | string, path?: string, feature?: string) => Promise<{archivedPath: string}>;
  archiveWorkspace: (featureName: string) => Promise<void>;
  // Workspace operations
  createWorkspace: (featureName: string, projects: string[]) => Promise<string | null>;
  attachWorkspaceSession: (featureName: string, aiTool?: AITool) => Promise<void>;
  workspaceExists: (featureName: string) => boolean;
  
  // Session operations  
  attachSession: (worktree: WorktreeInfo, aiTool?: AITool) => Promise<void>;
  attachShellSession: (worktree: WorktreeInfo) => Promise<void>;
  attachRunSession: (worktree: WorktreeInfo) => Promise<'success' | 'no_config'>;
  
  // AI tool management
  getAvailableAITools: () => (keyof typeof import('../constants.js').AI_TOOLS)[];
  needsToolSelection: (worktree: WorktreeInfo) => Promise<boolean>;
  
  // Projects
  discoverProjects: () => Array<{name: string; path: string}>;
  
  getRemoteBranches: (project: string) => Promise<Array<Record<string, any>>>;
  
  // Run configuration
  getRunConfigPath: (project: string) => string;
  createOrFillRunConfig: (project: string) => Promise<{success: boolean; content?: string; path: string; error?: string}>;
}

const WorktreeContext = createContext<WorktreeContextType | null>(null);

interface WorktreeProviderProps {
  children: ReactNode;
  core?: WorktreeCore;
}

export function WorktreeProvider({children, core: coreOverride}: WorktreeProviderProps) {
  const coreRef = React.useRef(coreOverride || new WorktreeCore());
  const core = coreRef.current;
  React.useEffect(() => { core.start(); return () => core.stop(); }, [core]);
  const state = React.useSyncExternalStore(core.subscribe.bind(core), core.get.bind(core), core.get.bind(core));

  // Navigation
  const selectWorktree = useCallback((index: number) => core.selectWorktree(index), [core]);
  const getSelectedWorktree = useCallback((): WorktreeInfo | null => core.getSelectedWorktree(), [core]);

  // Data operations
  const refresh = useCallback(async () => core.refresh(), [core]);
  const refreshVisibleStatus = useCallback(async (currentPage: number, pageSize: number) => core.refreshVisibleStatus(currentPage, pageSize), [core]);
  const forceRefreshVisible = useCallback(async (currentPage: number, pageSize: number) => core.forceRefreshVisible(currentPage, pageSize), [core]);

  // Worktree operations
  const createFeature = useCallback(async (projectName: string, featureName: string) => core.createFeature(projectName, featureName), [core]);
  const createFromBranch = useCallback(async (project: string, remoteBranch: string, localName: string) => core.createFromBranch(project, remoteBranch, localName), [core]);
  const archiveFeature = useCallback(async (wtOrProject: WorktreeInfo | string, p?: string, f?: string) => core.archiveFeature(wtOrProject, p, f), [core]);
  const archiveWorkspace = useCallback(async (featureName: string) => core.archiveWorkspace(featureName), [core]);
  const createWorkspace = useCallback(async (featureName: string, projects: string[]) => core.createWorkspace(featureName, projects), [core]);
  const attachWorkspaceSession = useCallback(async (featureName: string, aiTool?: AITool) => {
    // Find workspace header if present
    const wt = state.worktrees.find(w => (w as any).is_workspace && w.feature === featureName);
    if (wt) await core.attachSession(wt, aiTool);
  }, [core, state.worktrees]);
  const workspaceExists = useCallback((featureName: string) => core.workspaceExists(featureName), [core]);

  // Sessions
  const attachSession = useCallback(async (worktree: WorktreeInfo, aiTool?: AITool) => core.attachSession(worktree, aiTool), [core]);
  const attachShellSession = useCallback(async (worktree: WorktreeInfo) => core.attachShellSession(worktree), [core]);
  const attachRunSession = useCallback(async (worktree: WorktreeInfo) => core.attachRunSession(worktree), [core]);

  // AI tools
  const getAvailableAITools = useCallback(() => core.getAvailableAITools(), [core]);
  const needsToolSelection = useCallback(async (worktree: WorktreeInfo) => core.needsToolSelection(worktree), [core]);

  // Projects/branches
  const discoverProjects = useCallback(() => core.discoverProjects(), [core]);
  const getRemoteBranches = useCallback(async (project: string) => core.getRemoteBranches(project), [core]);

  // Run config
  const getRunConfigPath = useCallback((project: string) => core.getRunConfigPath(project), [core]);
  const createOrFillRunConfig = useCallback(async (project: string) => core.createOrFillRunConfig(project), [core]);

  const contextValue: WorktreeContextType = {
    // State
    worktrees: state.worktrees,
    loading: state.loading,
    lastRefreshed: state.lastRefreshed,
    selectedIndex: state.selectedIndex,
    memoryStatus: state.memoryStatus,
    versionInfo: state.versionInfo,
    
    // Navigation
    selectWorktree,
    getSelectedWorktree,
    
    // Data operations
    refresh,
    refreshVisibleStatus,
    forceRefreshVisible,
    
    // Worktree operations
    createFeature,
    createFromBranch,
    archiveFeature,
    archiveWorkspace,
    // Workspace operations
    createWorkspace,
    attachWorkspaceSession,
    workspaceExists,
    
    // Session operations
    attachSession,
    attachShellSession,
    attachRunSession,
    
    // AI tool management
    getAvailableAITools,
    needsToolSelection,
    
    // Projects
    discoverProjects,
    
    getRemoteBranches,
    
    // Run configuration
    getRunConfigPath,
    createOrFillRunConfig
  };

  return (
    <WorktreeContext.Provider value={contextValue}>
      {children}
    </WorktreeContext.Provider>
  );
}

export function useWorktreeContext(): WorktreeContextType {
  const context = useContext(WorktreeContext);
  if (!context) {
    throw new Error('useWorktreeContext must be used within a WorktreeProvider');
  }
  return context;
}

// Backward-compatible helpers used by tests
export function sortWorktreeSummaries<T extends {last_commit_ts?: number; project: string; feature: string}>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const d = (b.last_commit_ts ?? 0) - (a.last_commit_ts ?? 0);
    if (d !== 0) return d;
    if (a.project !== b.project) return a.project.localeCompare(b.project);
    return a.feature.localeCompare(b.feature);
  });
}

export function shouldPromptForAITool(
  availableTools: (keyof typeof import('../constants.js').AI_TOOLS)[],
  sessionExists: boolean,
  worktreeTool?: AITool | null
): boolean {
  if (sessionExists) return false;
  if (worktreeTool && worktreeTool !== 'none') return false;
  return availableTools.length > 1;
}
