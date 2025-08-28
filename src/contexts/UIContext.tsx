import React, {createContext, useContext, useState, ReactNode} from 'react';
import {WorktreeInfo} from '../models.js';

const h = React.createElement;

type UIMode = 'list' | 'create' | 'confirmArchive' | 'archived' | 'help' | 
             'pickProjectForBranch' | 'pickBranch' | 'diff' | 'runConfig' | 
             'runProgress' | 'runResults';

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
  runProject: string | null;
  runFeature: string | null;
  runPath: string | null;
  runConfigResult: any | null;
  
  // UI navigation operations - self-documenting methods
  showList: () => void;
  showCreateFeature: (projects: any[]) => void;
  showArchiveConfirmation: (worktree: WorktreeInfo) => void;
  showArchivedView: () => void;
  showHelp: () => void;
  showBranchPicker: (projects: any[], defaultProject?: string) => void;
  showDiffView: (worktreePath: string, type: 'full' | 'uncommitted') => void;
  showRunConfig: (project: string, feature: string, path: string) => void;
  showRunProgress: () => void;
  showRunResults: (result: any) => void;
  
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
  const [runProject, setRunProject] = useState<string | null>(null);
  const [runFeature, setRunFeature] = useState<string | null>(null);
  const [runPath, setRunPath] = useState<string | null>(null);
  const [runConfigResult, setRunConfigResult] = useState<any | null>(null);


  const resetUIState = () => {
    setMode('list');
    setCreateProjects(null);
    setPendingArchive(null);
    setBranchProject(null);
    setBranchList([]);
    setDiffWorktree(null);
    setRunProject(null);
    setRunFeature(null);
    setRunPath(null);
    setRunConfigResult(null);
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

  const showArchivedView = () => {
    setMode('archived');
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

  const showDiffView = (worktreePath: string, type: 'full' | 'uncommitted') => {
    setMode('diff');
    setDiffWorktree(worktreePath);
    setDiffType(type);
  };

  const showRunConfig = (project: string, feature: string, path: string) => {
    setMode('runConfig');
    setRunProject(project);
    setRunFeature(feature);
    setRunPath(path);
  };

  const showRunProgress = () => {
    setMode('runProgress');
  };

  const showRunResults = (result: any) => {
    setMode('runResults');
    setRunConfigResult(result);
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
    runProject,
    runFeature,
    runPath,
    runConfigResult,
    
    // Navigation methods
    showList,
    showCreateFeature,
    showArchiveConfirmation,
    showArchivedView,
    showHelp,
    showBranchPicker,
    showDiffView,
    showRunConfig,
    showRunProgress,
    showRunResults,
    requestExit
  };

  return h(UIContext.Provider, {value: contextValue}, children);
}

export function useUIContext(): UIContextType {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUIContext must be used within a UIProvider');
  }
  return context;
}