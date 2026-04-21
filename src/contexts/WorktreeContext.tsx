import React, {createContext, useContext, useCallback, ReactNode} from 'react';
import {WorktreeInfo} from '../models.js';
import type {AITool} from '../models.js';
import {MemoryStatus} from '../services/MemoryMonitorService.js';
import type {VersionInfo} from '../services/versionTypes.js';
import {WorktreeCore} from '../cores/WorktreeCore.js';
import {RalphCore, loadRalphConfig} from '../cores/RalphCore.js';
import {TrackerService} from '../services/TrackerService.js';
import {TmuxService} from '../services/TmuxService.js';
import {GitService} from '../services/GitService.js';
import {getProjectsDirectory} from '../config.js';

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
  refreshProjectWorktrees: (projectName: string) => Promise<void>;
  forceRefreshVisible: (currentPage: number, pageSize: number) => Promise<void>;
  
  // Worktree operations
  createFeature: (projectName: string, featureName: string) => Promise<WorktreeInfo | null>;
  recreateImplementWorktree: (project: string, slug: string) => Promise<WorktreeInfo | null>;
  createFromBranch: (project: string, remoteBranch: string, localName: string) => Promise<boolean>;
  archiveFeature: (worktreeOrProject: WorktreeInfo | string, path?: string, feature?: string) => Promise<{archivedPath: string}>;
  archiveWorkspace: (featureName: string) => Promise<void>;
  getUntrackedNonIgnoredFiles: (worktreePath: string) => string[];
  // Workspace operations
  createWorkspace: (featureName: string, projects: string[]) => Promise<string | null>;
  attachWorkspaceSession: (featureName: string, aiTool?: AITool) => Promise<void>;
  workspaceExists: (featureName: string) => boolean;
  
  // Session operations
  attachSession: (worktree: WorktreeInfo, aiTool?: AITool, initialPrompt?: string) => Promise<void>;
  launchSessionBackground: (worktree: WorktreeInfo, aiTool?: AITool, initialPrompt?: string) => Promise<void>;
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
  readConfigContent: (project: string) => string | null;
  generateConfigWithAI: (project: string) => Promise<{success: boolean; content?: string; path: string; error?: string}>;
  editConfigWithAI: (project: string, userPrompt: string) => Promise<{success: boolean; content?: string; path: string; error?: string}>;
  applyConfig: (project: string, content: string) => {success: boolean; error?: string};
  reapplyFiles: (project: string) => {count: number};
}

const WorktreeContext = createContext<WorktreeContextType | null>(null);

interface WorktreeProviderProps {
  children: ReactNode;
  core?: WorktreeCore;
}

export function WorktreeProvider({children, core: coreOverride}: WorktreeProviderProps) {
  const coreRef = React.useRef(coreOverride || new WorktreeCore());
  const core = coreRef.current;

  // Ralph runs alongside the worktree core. It samples on its own schedule
  // and only fires nudges when enabled per-project via tracker/ralph.json.
  // We build it lazily so tests that don't care about ralph aren't forced to
  // instantiate it (they won't hit the code path because there are no
  // projects with ralph enabled).
  const trackerRef = React.useRef(new TrackerService());
  const tmuxRef = React.useRef(new TmuxService());
  const gitRef = React.useRef(new GitService(getProjectsDirectory()));
  const ralphRef = React.useRef<RalphCore | null>(null);
  if (!ralphRef.current) {
    ralphRef.current = new RalphCore({
      tracker: trackerRef.current,
      tmux: tmuxRef.current,
      getWorktrees: () => coreRef.current.get().worktrees,
      getProjectPath: (project) => {
        const projects = gitRef.current.discoverProjects();
        const match = projects.find(p => p.name === project);
        return match?.path ?? '';
      },
    });
  }
  const ralph = ralphRef.current!;

  React.useEffect(() => { core.start(); return () => core.stop(); }, [core]);
  React.useEffect(() => { ralph.start(); return () => ralph.stop(); }, [ralph]);
  const state = React.useSyncExternalStore(core.subscribe.bind(core), core.get.bind(core), core.get.bind(core));
  const ralphState = React.useSyncExternalStore(ralph.subscribe.bind(ralph), ralph.get.bind(ralph), ralph.get.bind(ralph));

  // Navigation
  const selectWorktree = useCallback((index: number) => core.selectWorktree(index), [core]);
  const getSelectedWorktree = useCallback((): WorktreeInfo | null => core.getSelectedWorktree(), [core]);

  // Data operations
  const refresh = useCallback(async () => core.refresh(), [core]);
  const refreshVisibleStatus = useCallback(async (currentPage: number, pageSize: number) => core.refreshVisibleStatus(currentPage, pageSize), [core]);
  const refreshProjectWorktrees = useCallback(async (projectName: string) => core.refreshProjectWorktrees(projectName), [core]);
  const forceRefreshVisible = useCallback(async (currentPage: number, pageSize: number) => core.forceRefreshVisible(currentPage, pageSize), [core]);

  // Worktree operations
  const createFeature = useCallback(async (projectName: string, featureName: string) => core.createFeature(projectName, featureName), [core]);
  const recreateImplementWorktree = useCallback(async (project: string, slug: string) => core.recreateImplementWorktree(project, slug), [core]);
  const createFromBranch = useCallback(async (project: string, remoteBranch: string, localName: string) => core.createFromBranch(project, remoteBranch, localName), [core]);
  const archiveFeature = useCallback(async (wtOrProject: WorktreeInfo | string, p?: string, f?: string) => core.archiveFeature(wtOrProject, p, f), [core]);
  const archiveWorkspace = useCallback(async (featureName: string) => core.archiveWorkspace(featureName), [core]);
  const getUntrackedNonIgnoredFiles = useCallback((worktreePath: string) => core.getUntrackedNonIgnoredFiles(worktreePath), [core]);
  const createWorkspace = useCallback(async (featureName: string, projects: string[]) => core.createWorkspace(featureName, projects), [core]);
  const attachWorkspaceSession = useCallback(async (featureName: string, aiTool?: AITool) => {
    // Find workspace header if present
    const wt = state.worktrees.find(w => (w as any).is_workspace && w.feature === featureName);
    if (wt) await core.attachSession(wt, aiTool);
  }, [core, state.worktrees]);
  const workspaceExists = useCallback((featureName: string) => core.workspaceExists(featureName), [core]);

  // Sessions
  const attachSession = useCallback(async (worktree: WorktreeInfo, aiTool?: AITool, initialPrompt?: string) => core.attachSession(worktree, aiTool, initialPrompt), [core]);
  const launchSessionBackground = useCallback(async (worktree: WorktreeInfo, aiTool?: AITool, initialPrompt?: string) => core.launchSessionBackground(worktree, aiTool, initialPrompt), [core]);
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
  const readConfigContent = useCallback((project: string) => core.readConfigContent(project), [core]);
  const generateConfigWithAI = useCallback(async (project: string) => core.generateConfigWithAI(project), [core]);
  const editConfigWithAI = useCallback(async (project: string, userPrompt: string) => core.editConfigWithAI(project, userPrompt), [core]);
  const applyConfig = useCallback((project: string, content: string) => core.applyConfig(project, content), [core]);
  const reapplyFiles = useCallback((project: string) => core.reapplyFiles(project), [core]);

  // Decorate worktrees with ralph + agent status info so the list row can
  // render a compact chip. Lookup is O(projects × worktrees) but only on
  // state changes, and the maps are small in practice.
  const worktreesWithRalph = React.useMemo(() => {
    const projects = gitRef.current.discoverProjects();
    const projectPathByName = new Map(projects.map(p => [p.name, p.path]));
    return state.worktrees.map(wt => {
      const projectPath = projectPathByName.get(wt.project);
      if (!projectPath) return wt;
      const status = trackerRef.current.getItemStatus(projectPath, wt.feature);
      const ralphWt = ralphState.worktrees[`${wt.project}::${wt.feature}`];
      const cfg = loadRalphConfig(projectPath);
      if (!status && !ralphWt) return wt;
      const decorated = new WorktreeInfo({...wt});
      decorated.ralph = {
        state: trackerRef.current.isItemWaiting(status) ? status!.state : 'working',
        brief_description: status?.brief_description,
        nudges_this_stage: ralphWt?.nudgesThisStage ?? 0,
        max_nudges_per_stage: cfg.maxNudgesPerStage,
        capped: ralphWt?.capped ?? false,
      };
      return decorated;
    });
  }, [state.worktrees, ralphState]);

  const contextValue: WorktreeContextType = {
    // State
    worktrees: worktreesWithRalph,
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
    refreshProjectWorktrees,
    forceRefreshVisible,
    
    // Worktree operations
    createFeature,
    recreateImplementWorktree,
    createFromBranch,
    archiveFeature,
    archiveWorkspace,
    getUntrackedNonIgnoredFiles,
    // Workspace operations
    createWorkspace,
    attachWorkspaceSession,
    workspaceExists,
    
    // Session operations
    attachSession,
    launchSessionBackground,
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
    readConfigContent,
    generateConfigWithAI,
    editConfigWithAI,
    applyConfig,
    reapplyFiles,
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
