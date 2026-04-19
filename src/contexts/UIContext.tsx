import React, {createContext, useContext, useState, ReactNode} from 'react';
import {WorktreeInfo} from '../models.js';
import type {AITool} from '../models.js';


type UIMode = 'list' | 'create' | 'confirmArchive' | 'help' |
             'pickProjectForBranch' | 'pickBranch' | 'diff' | 'selectAITool' |
             'tmuxAttachLoading' | 'noProjects' | 'info' | 'settings';

export type SettingsAIResult = {
  project: string;
  success: boolean;
  content?: string;
  error?: string;
} | null;

interface UIContextType {
  // Current UI state values
  mode: UIMode;
  shouldExit: boolean;
  createProjects: any[] | null;
  pendingArchive: {project: string; feature: string; path: string} | null;
  branchProject: string | null;
  branchList: any[];
  diffWorktree: string | null;
  diffType: 'full' | 'uncommitted';
  pendingWorktree: WorktreeInfo | null;
  info: {title?: string; message: string; onClose?: () => void} | null;
  settingsProject: string | null;
  settingsAIResult: SettingsAIResult;
  settingsAILoadingProject: string | null;
  
  // UI navigation operations - self-documenting methods
  showList: () => void;
  showCreateFeature: (projects: any[]) => void;
  showArchiveConfirmation: (worktree: WorktreeInfo) => void;
  showHelp: () => void;
  showBranchPicker: (projects: any[], defaultProject?: string) => void;
  showBranchListForProject: (project: string, branches: any[]) => void;
  showDiffView: (worktreePath: string, type: 'full' | 'uncommitted') => void;
  showAIToolSelection: (worktree: WorktreeInfo) => void;
  showNoProjectsDialog: () => void;
  showInfo: (message: string, options?: {title?: string; onClose?: () => void}) => void;
  showSettings: (project: string) => void;
  beginSettingsAI: (project: string) => void;
  finishSettingsAI: (result: SettingsAIResult) => void;
  clearSettingsAIResult: () => void;
  runWithLoading: (task: () => Promise<unknown> | unknown, options?: {returnToList?: boolean}) => void;
  
  // Branch management
  setBranchList: (branches: any[]) => void;
  setBranchProject: (project: string) => void;
  
  // Application lifecycle
  requestExit: () => void;
}

const UIContext = createContext<UIContextType | null>(null);

interface UIProviderProps {
  children: ReactNode;
}

export function UIProvider({children}: UIProviderProps) {
  // Individual state hooks for each UI concern
  const [mode, setMode] = useState<UIMode>('list');
  const [shouldExit, setShouldExit] = useState(false);
  const [createProjects, setCreateProjects] = useState<any[] | null>(null);
  const [pendingArchive, setPendingArchive] = useState<{project: string; feature: string; path: string} | null>(null);
  const [branchProject, setBranchProject] = useState<string | null>(null);
  const [branchList, setBranchList] = useState<any[]>([]);
  const [diffWorktree, setDiffWorktree] = useState<string | null>(null);
  const [diffType, setDiffType] = useState<'full' | 'uncommitted'>('full');
  const [pendingWorktree, setPendingWorktree] = useState<WorktreeInfo | null>(null);
  const [info, setInfo] = useState<{title?: string; message: string; onClose?: () => void} | null>(null);
  const [settingsProject, setSettingsProject] = useState<string | null>(null);
  const [settingsAIResult, setSettingsAIResultState] = useState<SettingsAIResult>(null);
  const [settingsAILoadingProject, setSettingsAILoadingProject] = useState<string | null>(null);
  // Removed tmux hint state (dialog no longer used)


  const resetUIState = () => {
    setMode('list');
    setCreateProjects(null);
    setPendingArchive(null);
    setBranchProject(null);
    setBranchList([]);
    setDiffWorktree(null);
    setDiffType('full'); // Reset diff type to default
    setPendingWorktree(null);
    setInfo(null);
    setSettingsProject(null);
    // settingsAIResult / settingsAILoadingProject intentionally preserved so
    // an in-flight AI run keeps progressing while the user navigates away.
  };

  // UI Navigation Operations - Self-documenting and encapsulated
  const showList = () => {
    resetUIState();
  };

  const showCreateFeature = (projects: any[]) => {
    setMode('create');
    setCreateProjects(projects);
  };

  const showArchiveConfirmation = (worktree: WorktreeInfo) => {
    setMode('confirmArchive');
    setPendingArchive({
      project: worktree.project,
      feature: worktree.feature,
      path: worktree.path
    });
  };

  const showHelp = () => {
    setMode('help');
  };

  const showBranchPicker = (projects: any[], defaultProject?: string) => {
    if (projects.length === 1) {
      setMode('pickBranch');
      setBranchProject(defaultProject || projects[0].name);
      setCreateProjects(projects);
    } else {
      setMode('pickProjectForBranch');
      setCreateProjects(projects);
    }
  };

  const showBranchListForProject = (project: string, branches: any[]) => {
    setMode('pickBranch');
    setBranchProject(project);
    setBranchList(branches);
  };

  const showDiffView = (worktreePath: string, type: 'full' | 'uncommitted') => {
    setMode('diff');
    setDiffWorktree(worktreePath);
    setDiffType(type);
  };

  const showAIToolSelection = (worktree: WorktreeInfo) => {
    setMode('selectAITool');
    setPendingWorktree(worktree);
  };

  // Central helper to wrap tmux interactions with a minimal loading screen
  const runWithLoading = (task: () => Promise<unknown> | unknown, options?: {returnToList?: boolean}) => {
    const {returnToList = true} = options || {};
    setMode('tmuxAttachLoading');
    setTimeout(async () => {
      try {
        await task();
      } finally {
        if (returnToList) showList();
      }
    }, 10);
  };

  const showNoProjectsDialog = () => {
    setMode('noProjects');
  };

  const showInfo = (message: string, options?: {title?: string; onClose?: () => void}) => {
    setInfo({title: options?.title, message, onClose: options?.onClose});
    setMode('info');
  };

  const showSettings = (project: string) => {
    setMode('settings');
    setSettingsProject(project);
  };

  const beginSettingsAI = (project: string) => {
    setSettingsAILoadingProject(project);
  };

  const finishSettingsAI = (result: SettingsAIResult) => {
    setSettingsAILoadingProject(null);
    setSettingsAIResultState(result);
  };

  const clearSettingsAIResult = () => {
    setSettingsAIResultState(null);
  };


  const requestExit = () => {
    setShouldExit(true);
  };


  const contextValue: UIContextType = {
    // Current UI state values
    mode,
    shouldExit,
    createProjects,
    pendingArchive,
    branchProject,
    branchList,
    diffWorktree,
    diffType,
    pendingWorktree,
    info,
    settingsProject,
    settingsAIResult,
    settingsAILoadingProject,

    // Navigation methods
    showList,
    showCreateFeature,
    showArchiveConfirmation,
    showHelp,
    showBranchPicker,
    showBranchListForProject,
    showDiffView,
    showAIToolSelection,
    showInfo,
    showSettings,
    beginSettingsAI,
    finishSettingsAI,
    clearSettingsAIResult,
    runWithLoading,
    showNoProjectsDialog,
    
    // Branch management
    setBranchList,
    setBranchProject,
    
    requestExit
  };

  return (
    <UIContext.Provider value={contextValue}>
      {children}
    </UIContext.Provider>
  );
}

export function useUIContext(): UIContextType {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUIContext must be used within a UIProvider');
  }
  return context;
}
