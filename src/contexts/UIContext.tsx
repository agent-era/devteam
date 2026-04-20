import React, {createContext, useContext, useState, ReactNode} from 'react';
import {WorktreeInfo} from '../models.js';
import type {AITool} from '../models.js';
import type {ProposalCandidate} from '../services/TrackerService.js';
import {setLastTrackerProject} from '../shared/utils/lastTrackerProject.js';


type UIMode = 'list' | 'create' | 'confirmArchive' | 'help' |
             'pickProjectForBranch' | 'pickBranch' | 'diff' | 'selectAITool' |
             'tmuxAttachLoading' | 'noProjects' | 'info' | 'settings' |
             'tracker' | 'trackerItem' | 'trackerStages' | 'proposals';

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
  pendingArchive: {project: string; feature: string; path: string; projectPath?: string} | null;
  branchProject: string | null;
  branchList: any[];
  diffWorktree: string | null;
  diffType: 'full' | 'uncommitted';
  pendingWorktree: WorktreeInfo | null;
  pendingWorktreePrompt: string | null;
  pendingWorktreeReturn: (() => void) | null;
  info: {title?: string; message: string; onClose?: () => void} | null;
  settingsProject: string | null;
  settingsAIResult: SettingsAIResult;
  settingsAILoadingProject: string | null;
  trackerProject: {name: string; path: string} | null;
  trackerItemSlug: string | null;
  archiveReturn: (() => void) | null;
  diffReturn: (() => void) | null;
  proposalItems: ProposalCandidate[] | null;
  proposalGenerating: boolean;
  proposalError: string | null;

  // UI navigation operations - self-documenting methods
  showList: () => void;
  showCreateFeature: (projects: any[]) => void;
  showArchiveConfirmation: (worktree: WorktreeInfo, options?: {onReturn?: () => void; projectPath?: string}) => void;
  showHelp: () => void;
  showBranchPicker: (projects: any[], defaultProject?: string) => void;
  showBranchListForProject: (project: string, branches: any[]) => void;
  showDiffView: (worktreePath: string, type: 'full' | 'uncommitted', options?: {onReturn?: () => void}) => void;
  showAIToolSelection: (worktree: WorktreeInfo, options?: {initialPrompt?: string; onReturn?: () => void}) => void;
  showNoProjectsDialog: () => void;
  showInfo: (message: string, options?: {title?: string; onClose?: () => void}) => void;
  showSettings: (project: string) => void;
  showTracker: (project: {name: string; path: string}) => void;
  showTrackerItem: (slug: string) => void;
  showTrackerStages: () => void;
  showProposals: () => void;
  startProposalGeneration: () => void;
  finishProposalGeneration: (items: ProposalCandidate[] | null, error?: string) => void;
  beginSettingsAI: (project: string) => void;
  finishSettingsAI: (result: SettingsAIResult) => void;
  clearSettingsAIResult: () => void;
  runWithLoading: (task: () => Promise<unknown> | unknown, options?: {returnToList?: boolean; onReturn?: () => void}) => void;
  
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
  const [pendingArchive, setPendingArchive] = useState<{project: string; feature: string; path: string; projectPath?: string} | null>(null);
  const [branchProject, setBranchProject] = useState<string | null>(null);
  const [branchList, setBranchList] = useState<any[]>([]);
  const [diffWorktree, setDiffWorktree] = useState<string | null>(null);
  const [diffType, setDiffType] = useState<'full' | 'uncommitted'>('full');
  const [pendingWorktree, setPendingWorktree] = useState<WorktreeInfo | null>(null);
  const [pendingWorktreePrompt, setPendingWorktreePrompt] = useState<string | null>(null);
  const [pendingWorktreeReturn, setPendingWorktreeReturn] = useState<(() => void) | null>(null);
  const [info, setInfo] = useState<{title?: string; message: string; onClose?: () => void} | null>(null);
  const [settingsProject, setSettingsProject] = useState<string | null>(null);
  const [settingsAIResult, setSettingsAIResultState] = useState<SettingsAIResult>(null);
  const [settingsAILoadingProject, setSettingsAILoadingProject] = useState<string | null>(null);
  const [trackerProject, setTrackerProject] = useState<{name: string; path: string} | null>(null);
  const [trackerItemSlug, setTrackerItemSlug] = useState<string | null>(null);
  const [proposalItems, setProposalItems] = useState<ProposalCandidate[] | null>(null);
  const [proposalGenerating, setProposalGenerating] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  // Return-callbacks for screens that have multiple entry points (kanban vs main
  // view); when set, the screen routes back here instead of falling to showList.
  const [archiveReturn, setArchiveReturn] = useState<(() => void) | null>(null);
  const [diffReturn, setDiffReturn] = useState<(() => void) | null>(null);


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
    setTrackerProject(null);
    setTrackerItemSlug(null);
    setArchiveReturn(null);
    setDiffReturn(null);
    setProposalItems(null);
    // Proposal generating/error state is intentionally preserved across navigation
    // (generation continues in background; user sees the result when they return)
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

  const showArchiveConfirmation = (worktree: WorktreeInfo, options?: {onReturn?: () => void; projectPath?: string}) => {
    // Set mode first so the very next render leaves the WorktreeListScreen branch
    // (and its stdin handler) immediately, even if pendingArchive arrives one tick
    // later. Otherwise the stale handler can intercept the next keystroke.
    setMode('confirmArchive');
    setPendingArchive({
      project: worktree.project,
      feature: worktree.feature,
      path: worktree.path,
      projectPath: options?.projectPath,
    });
    setArchiveReturn(options?.onReturn ? () => options.onReturn! : null);
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

  const showDiffView = (worktreePath: string, type: 'full' | 'uncommitted', options?: {onReturn?: () => void}) => {
    setMode('diff');
    setDiffWorktree(worktreePath);
    setDiffType(type);
    setDiffReturn(options?.onReturn ? () => options.onReturn! : null);
  };

  const showAIToolSelection = (worktree: WorktreeInfo, options?: {initialPrompt?: string; onReturn?: () => void}) => {
    setMode('selectAITool');
    setPendingWorktree(worktree);
    setPendingWorktreePrompt(options?.initialPrompt ?? null);
    setPendingWorktreeReturn(options?.onReturn ? () => options.onReturn! : null);
  };

  // Central helper to wrap tmux interactions with a minimal loading screen.
  // After the task runs, navigate back via onReturn if provided, otherwise to
  // the worktree list (suppress with returnToList:false to leave navigation alone).
  const runWithLoading = (task: () => Promise<unknown> | unknown, options?: {returnToList?: boolean; onReturn?: () => void}) => {
    const {returnToList = true, onReturn} = options || {};
    setMode('tmuxAttachLoading');
    setTimeout(async () => {
      try {
        await task();
      } finally {
        if (onReturn) onReturn();
        else if (returnToList) showList();
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

  const showTracker = (project: {name: string; path: string}) => {
    // Switching projects must clear the previous project's proposal state, otherwise
    // the new board shows leftover proposals from the old one.
    if (trackerProject?.name !== project.name) {
      setProposalItems(null);
      setProposalGenerating(false);
      setProposalError(null);
    }
    setMode('tracker');
    setTrackerProject(project);
    setLastTrackerProject(project.name);
    setTrackerItemSlug(null);
  };

  const showTrackerItem = (slug: string) => {
    setMode('trackerItem');
    setTrackerItemSlug(slug);
  };

  const showTrackerStages = () => {
    setMode('trackerStages');
  };

  const showProposals = () => {
    setMode('proposals');
  };

  const startProposalGeneration = () => {
    setProposalGenerating(true);
    setProposalItems(null);
    setProposalError(null);
  };

  const finishProposalGeneration = (items: ProposalCandidate[] | null, error?: string) => {
    setProposalGenerating(false);
    setProposalItems(items);
    setProposalError(error || null);
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
    pendingWorktreePrompt,
    pendingWorktreeReturn,
    info,
    settingsProject,
    settingsAIResult,
    settingsAILoadingProject,
    trackerProject,
    trackerItemSlug,
    archiveReturn,
    diffReturn,
    proposalItems,
    proposalGenerating,
    proposalError,

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
    showTracker,
    showTrackerItem,
    showTrackerStages,
    showProposals,
    startProposalGeneration,
    finishProposalGeneration,
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
