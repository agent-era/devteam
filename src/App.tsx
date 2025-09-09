import React, {useEffect, useState} from 'react';
import {useApp, useStdin, Box} from 'ink';
import {runInteractive} from './shared/utils/commandExecutor.js';
import FullScreen from './components/common/FullScreen.js';
import HelpOverlay from './components/dialogs/HelpOverlay.js';
import DiffView from './components/views/DiffView.js';
import ProjectPickerDialog from './components/dialogs/ProjectPickerDialog.js';
import BranchPickerDialog from './components/dialogs/BranchPickerDialog.js';
import RunConfigDialog from './components/dialogs/RunConfigDialog.js';
import ProgressDialog from './components/dialogs/ProgressDialog.js';
import ConfigResultsDialog from './components/dialogs/ConfigResultsDialog.js';
import AIToolDialog from './components/dialogs/AIToolDialog.js';
import TmuxDetachHintDialog from './components/dialogs/TmuxDetachHintDialog.js';
import NoProjectsDialog from './components/dialogs/NoProjectsDialog.js';

import WorktreeListScreen from './screens/WorktreeListScreen.js';
import CreateFeatureScreen from './screens/CreateFeatureScreen.js';
import ArchiveConfirmScreen from './screens/ArchiveConfirmScreen.js';

import {WorktreeProvider, useWorktreeContext} from './contexts/WorktreeContext.js';
import {GitHubProvider, useGitHubContext} from './contexts/GitHubContext.js';
import {UIProvider, useUIContext} from './contexts/UIContext.js';
import {InputFocusProvider} from './contexts/InputFocusContext.js';
import {onRedraw, onRemount} from './shared/utils/redraw.js';


function AppContent() {
  const [redrawTick, setRedrawTick] = useState(0);
  const [remountTick, setRemountTick] = useState(0);
  const {exit} = useApp();
  const {isRawModeSupported} = useStdin();
  
  // Use our new contexts
  const {
    worktrees,
    loading,
    lastRefreshed,
    selectedIndex,
    getSelectedWorktree,
    createFeature,
    createFromBranch,
    archiveFeature,
    attachSession,
    attachShellSession,
    attachRunSession,
    discoverProjects,
    
    getRemoteBranches,
    getRunConfigPath,
    createOrFillRunConfig,
    getAvailableAITools,
    needsToolSelection
  } = useWorktreeContext();
  
  const {refreshPRStatus, getPRStatus} = useGitHubContext();
  
  const {
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
    pendingWorktree,
    
    // tmux hint
    tmuxHintShown,
    tmuxHintWorktree,
    tmuxHintTool,
    showTmuxHintFor,
    showAttachProgress,
    markTmuxHintShown,
    showList,
    showCreateFeature,
    showArchiveConfirmation,
    
    showHelp,
    showBranchPicker,
    showBranchListForProject,
    showDiffView,
    showRunConfig,
    showRunProgress,
    showRunResults,
    showAIToolSelection,
    showNoProjectsDialog,
    requestExit
  } = useUIContext();


  // Exit immediately if raw mode isn't supported (unless overridden in E2E)
  useEffect(() => {
    if (!isRawModeSupported && process.env.E2E_IGNORE_RAWMODE !== '1') {
      exit();
    }
  }, [isRawModeSupported, exit]);

  // Subscribe to global redraw requests to force a render pass
  useEffect(() => {
    const off = onRedraw(() => setRedrawTick(t => t + 1));
    return () => off();
  }, []);

  // Occasionally force a shallow remount of the screen container after tmux returns
  useEffect(() => {
    const off = onRemount(() => setRemountTick(t => t + 1));
    return () => off();
  }, []);

  // On startup: if no projects discovered, show dialog and wait for exit
  useEffect(() => {
    try {
      const projects = discoverProjects();
      if (!projects || projects.length === 0) {
        showNoProjectsDialog();
      }
    } catch {
      // If discovery throws, still show the dialog
      showNoProjectsDialog();
    }
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle explicit quit
  useEffect(() => {
    if (shouldExit) {
      exit();
      setTimeout(() => process.exit(0), 100);
    }
  }, [shouldExit, exit]);

  const handleAttachToSession = (sessionName: string) => {
    // Attach to the tmux session interactively
    runInteractive('tmux', ['attach-session', '-t', sessionName]);
  };
  // Operations simplified to use contexts
  const handleCreateFeature = () => {
    const projects = discoverProjects();
    if (!projects.length) {
      showNoProjectsDialog();
      return;
    }
    showCreateFeature(projects);
  };

  const handleArchiveFeature = () => {
    const selectedWorktree = getSelectedWorktree();
    if (selectedWorktree) {
      showArchiveConfirmation(selectedWorktree);
    }
  };

  const handleBranch = () => {
    const projects = discoverProjects();
    if (!projects.length) {
      showNoProjectsDialog();
      return;
    }
    
    const defaultProject = getSelectedWorktree()?.project || projects[0].name;
    showBranchPicker(projects, defaultProject);
  };

  const handleDiff = (type: 'full' | 'uncommitted') => {
    const selectedWorktree = getSelectedWorktree();
    if (selectedWorktree) {
      showDiffView(selectedWorktree.path, type);
    }
  };

  const handleExecuteRun = async () => {
    const selectedWorktree = getSelectedWorktree();
    if (!selectedWorktree) return;
    
    const result = await attachRunSession(selectedWorktree);
    
    if (result === 'no_config') {
      showRunConfig(selectedWorktree.project, selectedWorktree.feature, selectedWorktree.path);
    }
  };

  // Router content node (wrapped by a single FullScreen below)
  let content: React.ReactNode = null;

  // Initial startup loading screen while first refresh is in progress
  if (mode === 'list' && loading && lastRefreshed === 0) {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <ProgressDialog
          title="Starting DevTeam"
          message="Scanning projects and sessions..."
        />
      </Box>
    );
  }

  const handleConfigureRun = () => {
    const selectedWorktree = getSelectedWorktree();
    if (!selectedWorktree) return;
    
    showRunConfig(selectedWorktree.project, selectedWorktree.feature, selectedWorktree.path);
  };

  // Branch creation from remote branches
  const handleCreateFromBranch = async (remoteBranch: string, localName: string) => {
    const project = branchProject || getSelectedWorktree()?.project;
    if (!project) {
      showList();
      return;
    }
    
    try {
      const success = await createFromBranch(project, remoteBranch, localName);
      if (success) {
        showList();

        // Small delay to ensure UI state updates and new worktree is visible
        await new Promise(resolve => setTimeout(resolve, 100));

        // Find the newly created worktree entry
        const newWorktree = worktrees.find(wt => wt.project === project && wt.feature === localName);

        if (newWorktree) {
          // Check if tool selection is needed
          const needsSelection = await needsToolSelection(newWorktree);

          if (needsSelection) {
            // Show AI tool selection dialog
            showAIToolSelection(newWorktree);
          } else {
            // Auto-attach to the newly created session, but show tmux hint once
            if (!tmuxHintShown) {
              showTmuxHintFor(newWorktree);
            } else {
              await attachSession(newWorktree);
            }
          }
        }
      } else {
        showList();
      }
    } catch (error) {
      console.error('Failed to create worktree from branch:', error);
      showList();
    }
  };

  // Screen routing - much simpler now!
  if (!content && mode === 'create') {
    const defaultProject = getSelectedWorktree()?.project || createProjects?.[0]?.name;
    content = (
      <CreateFeatureScreen
        projects={createProjects || []}
        defaultProject={defaultProject}
        onCancel={showList}
        onSuccess={showList}
      />
    );
  }

  if (!content && mode === 'confirmArchive' && pendingArchive) {
    content = (
      <ArchiveConfirmScreen
        featureInfo={pendingArchive}
        onCancel={showList}
        onSuccess={showList}
      />
    );
  }

  // Archived view removed

  if (!content && mode === 'help') {
    content = (
      <Box flexGrow={1} paddingX={1}>
        <HelpOverlay onClose={showList} />
      </Box>
    );
  }

  if (!content && mode === 'attachProgress') {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <ProgressDialog
          title="Launching tmux session..."
          message="Press Ctrl+b, then d to detach and return"
        />
      </Box>
    );
  }

  if (!content && mode === 'diff' && diffWorktree) {
    content = (
      <Box flexGrow={1} paddingX={1}>
        <DiffView
          worktreePath={diffWorktree}
          title={diffType === 'uncommitted' ? 'Diff Viewer (Uncommitted Changes)' : 'Diff Viewer'}
          diffType={diffType}
          onClose={showList}
          onAttachToSession={handleAttachToSession}
        />
      </Box>
    );
  }

  if (!content && mode === 'pickProjectForBranch') {
    const defaultProject = getSelectedWorktree()?.project || createProjects?.[0]?.name;
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <ProjectPickerDialog
          projects={createProjects as any}
          defaultProject={defaultProject}
          onCancel={showList}
          onSubmit={async (project: string) => {
            // Load remote branches for the selected project
            const branches = await getRemoteBranches(project);
            showBranchListForProject(project, branches);
          }}
        />
      </Box>
    );
  }

  if (!content && mode === 'pickBranch') {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <BranchPickerDialog
          branches={branchList as any}
          onCancel={showList}
          onSubmit={handleCreateFromBranch}
          onRefresh={() => {
            // TODO: Refresh branch list
          }}
        />
      </Box>
    );
  }

  if (!content && mode === 'runConfig' && runProject) {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <RunConfigDialog
          project={runProject}
          configPath={getRunConfigPath(runProject)}
          claudePrompt="Analyze this project and generate run config"
          onCancel={showList}
          onCreateConfig={() => {
            showRunProgress();
            // Generate config in background
            setTimeout(async () => {
              const result = await createOrFillRunConfig(runProject!);
              showRunResults(result);
            }, 100);
          }}
        />
      </Box>
    );
  }

  if (!content && mode === 'runProgress' && runProject) {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <ProgressDialog
          title="Generating Run Configuration"
          message="Claude is analyzing your project and generating a run configuration..."
          project={runProject}
        />
      </Box>
    );
  }

  if (!content && mode === 'runResults' && runConfigResult && runProject && runFeature && runPath) {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <ConfigResultsDialog
          success={runConfigResult.success}
          content={runConfigResult.content}
          configPath={runConfigResult.path}
          error={runConfigResult.error}
          onClose={() => {
            showList();
            // If successful, try to execute the run session
            if (runConfigResult.success) {
              try {
                const worktreeInfo = {project: runProject!, feature: runFeature!, path: runPath!};
                attachRunSession(worktreeInfo as any).catch(() => {});
              } catch {}
            }
          }}
        />
      </Box>
    );
  }

  if (!content && mode === 'selectAITool' && pendingWorktree) {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <AIToolDialog
          availableTools={getAvailableAITools()}
          currentTool={pendingWorktree.session?.ai_tool}
          onSelect={async (tool) => {
            const wt = pendingWorktree;
            showList();
            // Attach session with selected tool, but show tmux hint once
            try {
              if (!tmuxHintShown) {
                showTmuxHintFor(wt, tool);
              } else {
                await attachSession(wt, tool);
              }
            } catch (error) {
              console.error('Failed to attach session with selected tool:', error);
            }
          }}
          onCancel={showList}
        />
      </Box>
    );
  }

  if (!content && mode === 'tmuxHint') {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <TmuxDetachHintDialog
          onContinue={async () => {
            const wt = tmuxHintWorktree;
            const tool = tmuxHintTool || undefined;
            markTmuxHintShown();
            if (wt) {
              try {
                showAttachProgress();
                await attachSession(wt, tool);
                // After returning, refresh and show list
                await refresh('none');
                showList();
              } catch (error) {
                console.error('Failed to attach after tmux hint:', error);
                showList();
              }
            }
          }}
        />
      </Box>
    );
  }

  if (!content && mode === 'noProjects') {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <NoProjectsDialog onExit={requestExit} />
      </Box>
    );
  }

  // Default: Main worktree list screen
  if (!content) {
    content = (
      <WorktreeListScreen
        onCreateFeature={handleCreateFeature}
        onArchiveFeature={handleArchiveFeature}
        onHelp={showHelp}
        onBranch={handleBranch}
        onDiff={handleDiff}
        onQuit={requestExit}
        onExecuteRun={handleExecuteRun}
        onConfigureRun={handleConfigureRun}
      />
    );
  }

  // Wrap all routed content in a single persistent FullScreen to avoid flicker/blanking
  return (
    <FullScreen key={remountTick}>
      {content}
    </FullScreen>
  );
}

export default function App() {
  return (
    <InputFocusProvider>
      <GitHubProvider>
        <AppWithGitHub />
      </GitHubProvider>
    </InputFocusProvider>
  );
}

function AppWithGitHub() {
  return (
    <WorktreeProvider>
      <UIProvider>
        <AppContent />
      </UIProvider>
    </WorktreeProvider>
  );
}

// Test-friendly entry that allows injecting fake services while using the full App composition
export function TestableApp({
  gitService,
  gitHubService,
  tmuxService
}: {
  gitService?: any;
  gitHubService?: any;
  tmuxService?: any;
}) {
  return (
    <InputFocusProvider>
      <GitHubProvider gitHubService={gitHubService} gitService={gitService}>
        <WorktreeProvider gitService={gitService} tmuxService={tmuxService}>
          <UIProvider>
            <AppContent />
          </UIProvider>
        </WorktreeProvider>
      </GitHubProvider>
    </InputFocusProvider>
  );
}
