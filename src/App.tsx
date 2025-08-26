import React, {useState, useEffect} from 'react';
import {useApp, useStdin, Box} from 'ink';
import FullScreen from './components/common/FullScreen.js';
import HelpOverlay from './components/dialogs/HelpOverlay.js';
import CleanDiffView from './components/views/CleanDiffView.js';
import ProjectPickerDialog from './components/dialogs/ProjectPickerDialog.js';
import BranchPickerDialog from './components/dialogs/BranchPickerDialog.js';

import WorktreeListScreen from './screens/WorktreeListScreen.js';
import CreateFeatureScreen from './screens/CreateFeatureScreen.js';
import ArchiveConfirmScreen from './screens/ArchiveConfirmScreen.js';
import ArchivedScreen from './screens/ArchivedScreen.js';

import {ServicesProvider} from './contexts/ServicesContext.js';
import {AppStateProvider, useAppState} from './contexts/AppStateContext.js';
import {useServices} from './contexts/ServicesContext.js';
import {BASE_PATH, DIR_BRANCHES_SUFFIX} from './constants.js';

const h = React.createElement;

type UIMode = 'list' | 'create' | 'confirmArchive' | 'archived' | 'help' | 'pickProjectForBranch' | 'pickBranch' | 'diff';

interface PendingArchive {
  project: string;
  feature: string;
  path: string;
}

function AppContent() {
  const {gitService, worktreeService} = useServices();
  const {state} = useAppState();
  const {exit} = useApp();
  const {isRawModeSupported} = useStdin();
  
  const [shouldExit, setShouldExit] = useState(false);
  const [uiMode, setUiMode] = useState<UIMode>('list');
  const [createProjects, setCreateProjects] = useState<any[]>([]);
  const [pendingArchive, setPendingArchive] = useState<PendingArchive | null>(null);
  const [branchProject, setBranchProject] = useState<string | null>(null);
  const [branchList, setBranchList] = useState<any[]>([]);
  const [diffWorktree, setDiffWorktree] = useState<string | null>(null);
  const [diffType, setDiffType] = useState<'full' | 'uncommitted'>('full');

  // Auto-exit for non-interactive environments
  useEffect(() => {
    if (!isRawModeSupported) {
      const id = setTimeout(() => exit(), 800);
      return () => clearTimeout(id);
    }
  }, [isRawModeSupported, exit]);

  // Handle explicit quit
  useEffect(() => {
    if (shouldExit) {
      exit();
      setTimeout(() => process.exit(0), 100);
    }
  }, [shouldExit, exit]);

  const handleQuit = () => setShouldExit(true);

  const handleCreateFeature = () => {
    const projects = gitService.discoverProjects();
    if (!projects.length) {
      // TODO: Show error message
      return;
    }
    setCreateProjects(projects);
    setUiMode('create');
  };

  const handleArchiveFeature = () => {
    const selectedWorktree = state.worktrees[state.selectedIndex];
    if (!selectedWorktree) return;
    
    setPendingArchive({
      project: selectedWorktree.project,
      feature: selectedWorktree.feature,
      path: selectedWorktree.path
    });
    setUiMode('confirmArchive');
  };

  const handleBranch = () => {
    const projects = gitService.discoverProjects();
    if (!projects.length) return;
    
    const defaultProject = state.worktrees[state.selectedIndex]?.project || projects[0].name;
    
    if (projects.length === 1) {
      setBranchProject(defaultProject);
      loadBranchList(defaultProject);
      setUiMode('pickBranch');
    } else {
      setCreateProjects(projects);
      setUiMode('pickProjectForBranch');
    }
  };

  const handleDiff = (type: 'full' | 'uncommitted') => {
    const selectedWorktree = state.worktrees[state.selectedIndex];
    if (selectedWorktree) {
      setDiffWorktree(selectedWorktree.path);
      setDiffType(type);
      setUiMode('diff');
    }
  };

  const loadBranchList = (project: string) => {
    const repoPath = state.worktrees.find(w => w.project === project)?.path || `${BASE_PATH}/${project}`;
    const baseList = gitService.getRemoteBranches(project);
    setBranchList(baseList);
    
    // Async enrichment with PR data
    (async () => {
      try {
        const prMap = await gitService.batchFetchPRDataAsync(repoPath, {includeChecks: true, includeTitle: true});
        const enriched = baseList.map((b: any) => {
          const pr = prMap[b.local_name] || prMap[`feature/${b.local_name}`];
          return pr ? {
            ...b, 
            pr_number: pr.number, 
            pr_state: pr.state, 
            pr_checks: pr.checks, 
            pr_title: (pr as any).title
          } : b;
        });
        setBranchList(enriched);
      } catch {}
    })();
  };

  const handleCreateFromBranch = async (remoteBranch: string, localName: string) => {
    const project = branchProject || state.worktrees[state.selectedIndex]?.project;
    if (!project) {
      setUiMode('list');
      return;
    }
    
    const success = gitService.createWorktreeFromRemote(project, remoteBranch, localName);
    if (success) {
      const worktreePath = [BASE_PATH, `${project}${DIR_BRANCHES_SUFFIX}`, localName].join('/');
      worktreeService.setupWorktreeEnvironment(project, worktreePath);
      worktreeService.createTmuxSession(project, localName, worktreePath);
    }
    
    setUiMode('list');
    setBranchProject(null);
    setBranchList([]);
  };

  const resetToList = () => {
    setUiMode('list');
    setPendingArchive(null);
    setBranchProject(null);
    setBranchList([]);
    setDiffWorktree(null);
  };

  // Screen routing
  if (uiMode === 'create') {
    const defaultProject = state.worktrees[state.selectedIndex]?.project || createProjects[0]?.name;
    return h(CreateFeatureScreen, {
      projects: createProjects,
      defaultProject,
      onCancel: resetToList,
      onSuccess: resetToList
    });
  }

  if (uiMode === 'confirmArchive' && pendingArchive) {
    return h(ArchiveConfirmScreen, {
      featureInfo: pendingArchive,
      onCancel: resetToList,
      onSuccess: resetToList
    });
  }

  if (uiMode === 'archived') {
    return h(ArchivedScreen, {
      onBack: resetToList
    });
  }

  if (uiMode === 'help') {
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, paddingX: 1}, 
        h(HelpOverlay, {onClose: resetToList})
      )
    );
  }

  if (uiMode === 'diff' && diffWorktree) {
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, paddingX: 1},
        h(CleanDiffView, {
          worktreePath: diffWorktree,
          title: diffType === 'uncommitted' ? 'Diff Viewer (Uncommitted Changes)' : 'Diff Viewer',
          diffType,
          onClose: resetToList
        })
      )
    );
  }

  if (uiMode === 'pickProjectForBranch') {
    const defaultProject = state.worktrees[state.selectedIndex]?.project || createProjects[0]?.name;
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
        h(ProjectPickerDialog, {
          projects: createProjects as any,
          defaultProject,
          onCancel: resetToList,
          onSubmit: (project: string) => {
            setBranchProject(project);
            loadBranchList(project);
            setUiMode('pickBranch');
          }
        })
      )
    );
  }

  if (uiMode === 'pickBranch') {
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
        h(BranchPickerDialog, {
          branches: branchList as any,
          onCancel: resetToList,
          onSubmit: handleCreateFromBranch,
          onRefresh: () => {
            if (branchProject) loadBranchList(branchProject);
          }
        })
      )
    );
  }

  // Default: Main worktree list screen
  return h(WorktreeListScreen, {
    onCreateFeature: handleCreateFeature,
    onArchiveFeature: handleArchiveFeature,
    onViewArchived: () => setUiMode('archived'),
    onHelp: () => setUiMode('help'),
    onBranch: handleBranch,
    onDiff: handleDiff,
    onQuit: handleQuit
  });
}

export default function App() {
  return h(ServicesProvider, null,
    h(AppStateProvider, null,
      h(AppContent)
    )
  );
}