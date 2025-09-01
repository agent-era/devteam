import React, {useEffect} from 'react';
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

import WorktreeListScreen from './screens/WorktreeListScreen.js';
import CreateFeatureScreen from './screens/CreateFeatureScreen.js';
import ArchiveConfirmScreen from './screens/ArchiveConfirmScreen.js';

import {WorktreeProvider, useWorktreeContext} from './contexts/WorktreeContext.js';
import {GitHubProvider, useGitHubContext} from './contexts/GitHubContext.js';
import {UIProvider, useUIContext} from './contexts/UIContext.js';
import {InputFocusProvider} from './contexts/InputFocusContext.js';


function AppContent() {
  const {exit} = useApp();
  const {isRawModeSupported} = useStdin();
  
  // Use our new contexts
  const {
    worktrees,
    loading,
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
    requestExit
  } = useUIContext();


  // Exit immediately if raw mode isn't supported
  useEffect(() => {
    if (!isRawModeSupported) {
      exit();
    }
  }, [isRawModeSupported, exit]);

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
    if (!projects.length) return;
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
    if (!projects.length) return;
    
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
        
        // Small delay then auto-attach to the newly created session
        await new Promise(resolve => setTimeout(resolve, 100));
        const worktreePath = `/home/mserv/projects/${project}-branches/${localName}`;
        // The session will be automatically created by createFromBranch
      } else {
        showList();
      }
    } catch (error) {
      console.error('Failed to create worktree from branch:', error);
      showList();
    }
  };

  // Screen routing - much simpler now!
  if (mode === 'create') {
    const defaultProject = getSelectedWorktree()?.project || createProjects?.[0]?.name;
    return (
      <CreateFeatureScreen
        projects={createProjects || []}
        defaultProject={defaultProject}
        onCancel={showList}
        onSuccess={showList}
      />
    );
  }

  if (mode === 'confirmArchive' && pendingArchive) {
    return (
      <ArchiveConfirmScreen
        featureInfo={pendingArchive}
        onCancel={showList}
        onSuccess={showList}
      />
    );
  }

  // Archived view removed

  if (mode === 'help') {
    return (
      <FullScreen>
        <Box flexGrow={1} paddingX={1}>
          <HelpOverlay onClose={showList} />
        </Box>
      </FullScreen>
    );
  }

  if (mode === 'diff' && diffWorktree) {
    return (
      <FullScreen>
        <Box flexGrow={1} paddingX={1}>
          <DiffView
            worktreePath={diffWorktree}
            title={diffType === 'uncommitted' ? 'Diff Viewer (Uncommitted Changes)' : 'Diff Viewer'}
            diffType={diffType}
            onClose={showList}
            onAttachToSession={handleAttachToSession}
          />
        </Box>
      </FullScreen>
    );
  }

  if (mode === 'pickProjectForBranch') {
    const defaultProject = getSelectedWorktree()?.project || createProjects?.[0]?.name;
    return (
      <FullScreen>
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
      </FullScreen>
    );
  }

  if (mode === 'pickBranch') {
    return (
      <FullScreen>
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
      </FullScreen>
    );
  }

  if (mode === 'runConfig' && runProject) {
    return (
      <FullScreen>
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
      </FullScreen>
    );
  }

  if (mode === 'runProgress' && runProject) {
    return (
      <FullScreen>
        <Box flexGrow={1} alignItems="center" justifyContent="center">
          <ProgressDialog
            title="Generating Run Configuration"
            message="Claude is analyzing your project and generating a run configuration..."
            project={runProject}
          />
        </Box>
      </FullScreen>
    );
  }

  if (mode === 'runResults' && runConfigResult && runProject && runFeature && runPath) {
    return (
      <FullScreen>
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
      </FullScreen>
    );
  }

  if (mode === 'selectAITool' && pendingWorktree) {
    return h(FullScreen, null,
      h(Box as any, {flexGrow: 1, alignItems: 'center', justifyContent: 'center'},
        h(AIToolDialog, {
          availableTools: getAvailableAITools(),
          currentTool: pendingWorktree.session?.ai_tool,
          onSelect: async (tool) => {
            showList();
            // Attach session with selected tool
            try {
              await attachSession(pendingWorktree, tool);
            } catch (error) {
              console.error('Failed to attach session with selected tool:', error);
            }
          },
          onCancel: showList
        })
      )
    );
  }

  // Default: Main worktree list screen
  return (
    <FullScreen>
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
