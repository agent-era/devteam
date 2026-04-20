import React, {useEffect, useMemo} from 'react';
import path from 'path';
import {useApp, useStdin, Box} from 'ink';
import {runInteractive} from './shared/utils/commandExecutor.js';
import {TmuxService} from './services/TmuxService.js';
import FullScreen from './components/common/FullScreen.js';
import HelpOverlay from './components/dialogs/HelpOverlay.js';
import DiffView from './components/views/DiffView.js';
import ProjectPickerDialog from './components/dialogs/ProjectPickerDialog.js';
import BranchPickerDialog from './components/dialogs/BranchPickerDialog.js';
import SettingsDialog from './components/dialogs/SettingsDialog.js';
import InfoDialog from './components/dialogs/InfoDialog.js';
import ProgressDialog from './components/dialogs/ProgressDialog.js';
import AIToolDialog from './components/dialogs/AIToolDialog.js';
import NoProjectsDialog from './components/dialogs/NoProjectsDialog.js';
import LoadingScreen from './components/common/LoadingScreen.js';
import {getLastTrackerProject} from './shared/utils/lastTrackerProject.js';

import WorktreeListScreen from './screens/WorktreeListScreen.js';
import CreateFeatureScreen from './screens/CreateFeatureScreen.js';
import ArchiveConfirmScreen from './screens/ArchiveConfirmScreen.js';
import TrackerBoardScreen from './screens/TrackerBoardScreen.js';
import TrackerItemScreen from './screens/TrackerItemScreen.js';
import TrackerStagesScreen from './screens/TrackerStagesScreen.js';
import TrackerProposalScreen from './screens/TrackerProposalScreen.js';

import {WorktreeProvider, useWorktreeContext} from './contexts/WorktreeContext.js';
import {GitHubProvider, useGitHubContext} from './contexts/GitHubContext.js';
import {UIProvider, useUIContext} from './contexts/UIContext.js';
import {InputFocusProvider} from './contexts/InputFocusContext.js';
import {WorktreeCore} from './cores/WorktreeCore.js';
import {GitHubCore} from './cores/GitHubCore.js';
import {TrackerService, type TrackerItem, type TrackerStage} from './services/TrackerService.js';
import type {AITool} from './models.js';


function AppContent() {
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
    recreateImplementWorktree,
    createFromBranch,
    archiveFeature,
    attachSession,
    attachShellSession,
    attachRunSession,
    discoverProjects,
    
    getRemoteBranches,
    getRunConfigPath,
    readConfigContent,
    generateConfigWithAI,
    editConfigWithAI,
    applyConfig,
    reapplyFiles,
    getAvailableAITools,
    needsToolSelection,
    launchSessionBackground,
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
    pendingWorktree,
    pendingWorktreePrompt,
    pendingWorktreeReturn,
    archiveReturn,
    diffReturn,
    info,

    showList,
    showCreateFeature,
    showArchiveConfirmation,

    showHelp,
    showBranchPicker,
    showBranchListForProject,
    showDiffView,
    showAIToolSelection,
    showNoProjectsDialog,
    showInfo,
    showSettings,
    beginSettingsAI,
    finishSettingsAI,
    clearSettingsAIResult,
    settingsProject,
    settingsAIResult,
    settingsAILoadingProject,
    trackerProject,
    trackerItemSlug,
    showTracker,
    showTrackerItem,
    showTrackerStages,
    proposalItems,
    finishProposalGeneration,
    runWithLoading,
    requestExit
  } = useUIContext();


  // Exit immediately if raw mode isn't supported (unless overridden in E2E)
  useEffect(() => {
    if (!isRawModeSupported && process.env.E2E_IGNORE_RAWMODE !== '1') {
      exit();
    }
  }, [isRawModeSupported, exit]);

  // On startup: discover projects and default to the tracker for the last-used project
  useEffect(() => {
    try {
      const projects = discoverProjects();
      if (!projects || projects.length === 0) {
        showNoProjectsDialog();
        return;
      }
      const lastName = getLastTrackerProject();
      const project = (lastName && projects.find(p => p.name === lastName)) || projects[0];
      showTracker(project);
    } catch {
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
    const tmux = new TmuxService();
    runWithLoading(() => tmux.attachSessionWithControls(sessionName));
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

    runWithLoading(async () => {
      const result = await attachRunSession(selectedWorktree);
      if (result === 'no_config') {
        showSettings(selectedWorktree.project);
      } else {
        showList();
      }
    }, {returnToList: false});
  };

  const handleTracker = () => {
    const projects = discoverProjects();
    if (!projects.length) {
      showNoProjectsDialog();
      return;
    }
    const selectedWorktree = getSelectedWorktree();
    if (selectedWorktree && selectedWorktree.project !== 'workspace') {
      const project = projects.find(candidate => candidate.name === selectedWorktree.project);
      if (project) {
        showTracker(project);
        return;
      }
    }
    showTracker(projects[0]);
  };

  const tracker = useMemo(() => new TrackerService(), []);

  // Re-load only when the slug or project changes; without this, every WorktreeCore
  // tick would walk the item tree from disk just to redraw the item screen.
  const trackerItem = useMemo(() => {
    if (mode !== 'trackerItem' || !trackerProject || !trackerItemSlug) return null;
    const board = tracker.loadBoard(trackerProject.name, trackerProject.path);
    return board.columns.flatMap(c => c.items).find(c => c.slug === trackerItemSlug) ?? null;
  }, [mode, trackerProject, trackerItemSlug, tracker]);

  const buildPromptForItem = (item: TrackerItem, stageOverride?: TrackerStage, itemDirOverride?: string) => {
    const stagesConfig = tracker.loadStagesConfig(item.projectPath);
    const stage = stageOverride ?? item.stage;
    const stageConf = stage !== 'archive' ? stagesConfig[stage as Exclude<TrackerStage, 'archive'>] : null;
    if (!stageConf) return '';
    return tracker.buildPlanningPrompt(item, stageConf, itemDirOverride);
  };

  const ensureItemWorktree = async (
    project: {name: string; path: string},
    item: TrackerItem,
  ) => {
    let worktree = worktrees.find(wt => wt.project === project.name && wt.feature === item.slug) || null;
    if (!worktree) worktree = await recreateImplementWorktree(project.name, item.slug);
    if (!worktree) return null;
    tracker.ensureItemFiles(project.path, item.slug, worktree.path, item);
    return worktree;
  };

  const prepareItemSession = async (
    project: {name: string; path: string},
    item: TrackerItem,
    stage: TrackerStage,
  ) => {
    const worktree = await ensureItemWorktree(project, item);
    if (!worktree) return null;
    const worktreeItemDir = path.join(worktree.path, 'tracker', 'items', item.slug);
    return {worktree, prompt: buildPromptForItem(item, stage, worktreeItemDir)};
  };

  const launchSessionForItem = async (
    project: {name: string; path: string},
    item: TrackerItem,
    stage: TrackerStage,
  ) => {
    const prepared = await prepareItemSession(project, item, stage);
    if (!prepared) { showTracker(project); return; }
    const needsSelection = await needsToolSelection(prepared.worktree);
    if (needsSelection) {
      showAIToolSelection(prepared.worktree, {initialPrompt: prepared.prompt, onReturn: () => showTracker(project)});
    } else {
      await attachSession(prepared.worktree, undefined, prepared.prompt);
      showTracker(project);
    }
  };

  const launchSessionForItemBackground = async (
    project: {name: string; path: string},
    item: TrackerItem,
    stage: TrackerStage,
    aiTool?: AITool,
  ) => {
    const prepared = await prepareItemSession(project, item, stage);
    if (!prepared) return;
    await launchSessionBackground(prepared.worktree, aiTool, prepared.prompt);
  };

  const handleAttachSession = (item: TrackerItem) => {
    if (!trackerProject) return;
    const project = trackerProject;
    runWithLoading(async () => {
      const worktree = await ensureItemWorktree(project, item);
      if (!worktree) { showTracker(project); return; }
      const needsSelection = await needsToolSelection(worktree);
      if (needsSelection) {
        showAIToolSelection(worktree, {onReturn: () => showTracker(project)});
      } else {
        await attachSession(worktree);
        showTracker(project);
      }
    }, {returnToList: false});
  };

  const handleStageAction = (item: TrackerItem) => {
    if (!trackerProject) return;
    const project = trackerProject;
    const nextStage = tracker.nextStage(item.stage);
    const targetStage = nextStage && nextStage !== 'archive' ? nextStage : item.stage;
    const updatedItem = {...item, stage: targetStage};
    runWithLoading(async () => {
      try {
        // Only advance the on-disk stage once the worktree exists and the prompt is
        // built — if launchSessionForItem throws or the worktree can't be created,
        // we don't want the item left half-advanced with no session.
        await launchSessionForItem(project, updatedItem, targetStage);
        if (nextStage && nextStage !== 'archive') {
          tracker.moveItem(project.path, item.slug, nextStage);
        }
      } catch {
        // launchSessionForItem already routes back to the tracker on failure.
      }
    }, {returnToList: false});
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

  const handleSettings = () => {
    const selectedWorktree = getSelectedWorktree();
    if (!selectedWorktree) return;
    showSettings(selectedWorktree.project);
  };

  const runSettingsAI = (project: string, work: () => Promise<{success: boolean; content?: string; error?: string}>) => {
    if (settingsAILoadingProject === project) return;
    clearSettingsAIResult();
    beginSettingsAI(project);
    void (async () => {
      const r = await work();
      finishSettingsAI({project, success: r.success, content: r.content, error: r.error});
    })();
  };

  const applyProposedConfig = (project: string, content: string) => {
    const result = applyConfig(project, content);
    if (result.success) clearSettingsAIResult();
    else finishSettingsAI({project, success: false, error: result.error});
  };

  // Read the on-disk config only when we need it — when the settings screen opens, when an AI
  // result arrives, or after an apply (which flips settingsAIResult back to null).
  const settingsCurrentContent = useMemo(
    () => settingsProject ? readConfigContent(settingsProject) : null,
    [settingsProject, settingsAIResult, readConfigContent]
  );

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
            // Auto-attach to the newly created session
            await attachSession(newWorktree);
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
    const back = archiveReturn ?? showList;
    content = (
      <ArchiveConfirmScreen
        featureInfo={pendingArchive}
        onCancel={back}
        onSuccess={back}
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

  if (!content && mode === 'diff' && diffWorktree) {
    const sel = getSelectedWorktree?.();
    const workspaceFeature = sel && sel.is_workspace_child ? (sel.parent_feature || sel.feature) : undefined;
    content = (
      <Box flexGrow={1} paddingX={1}>
        <DiffView
          worktreePath={diffWorktree}
          title={diffType === 'uncommitted' ? 'Diff Viewer (Uncommitted Changes)' : 'Diff Viewer'}
          diffType={diffType}
          onClose={diffReturn ?? showList}
          onAttachToSession={handleAttachToSession}
          workspaceFeature={workspaceFeature}
        />
      </Box>
    );
  }

  if (!content && mode === 'info' && info) {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <InfoDialog
          title={info.title}
          message={info.message}
          onClose={() => {
            try { info.onClose && info.onClose(); } finally { showList(); }
          }}
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

  if (!content && mode === 'tmuxAttachLoading') {
    content = (
      <LoadingScreen />
    );
  }

  if (!content && mode === 'settings' && settingsProject) {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <SettingsDialog
          project={settingsProject}
          configPath={getRunConfigPath(settingsProject)}
          currentContent={settingsCurrentContent}
          aiLoadingProject={settingsAILoadingProject}
          pendingResult={settingsAIResult}
          onGenerate={() => runSettingsAI(settingsProject, () => generateConfigWithAI(settingsProject))}
          onEdit={(userPrompt: string) => runSettingsAI(settingsProject, () => editConfigWithAI(settingsProject, userPrompt))}
          onApply={(proposed: string) => applyProposedConfig(settingsProject, proposed)}
          onReapplyFiles={() => reapplyFiles(settingsProject)}
          onDiscardResult={() => clearSettingsAIResult()}
          onCancel={showList}
        />
      </Box>
    );
  }

  if (!content && mode === 'selectAITool' && pendingWorktree) {
    const returnFn = pendingWorktreeReturn ?? showList;
    const prompt = pendingWorktreePrompt ?? undefined;
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <AIToolDialog
          availableTools={getAvailableAITools()}
          currentTool={pendingWorktree.session?.ai_tool}
          onSelect={async (tool) => {
            const wt = pendingWorktree;
            try {
              runWithLoading(() => attachSession(wt, tool, prompt), {onReturn: returnFn});
            } catch (error) {
              console.error('Failed to attach session with selected tool:', error);
            }
          }}
          onCancel={returnFn}
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

  if (!content && mode === 'tracker' && trackerProject) {
    content = (
      <TrackerBoardScreen
        project={trackerProject.name}
        projectPath={trackerProject.path}
        onBack={requestExit}
        onOpenItem={(item) => showTrackerItem(item.slug)}
        onAttachItem={(item) => handleAttachSession(item)}
        onLaunchItemBackground={(item, tool) =>
          launchSessionForItemBackground(trackerProject!, item, item.stage, tool)
        }
        onCustomizeStages={showTrackerStages}
      />
    );
  }

  if (!content && mode === 'trackerStages' && trackerProject) {
    content = (
      <TrackerStagesScreen
        projectPath={trackerProject.path}
        onBack={() => showTracker(trackerProject)}
      />
    );
  }

  if (!content && mode === 'proposals' && trackerProject && proposalItems) {
    content = (
      <TrackerProposalScreen
        project={trackerProject.name}
        projectPath={trackerProject.path}
        proposals={proposalItems}
        onBack={() => showTracker(trackerProject)}
        onResolved={() => { finishProposalGeneration(null); showTracker(trackerProject); }}
      />
    );
  }

  if (!content && mode === 'trackerItem' && trackerProject && trackerItemSlug) {
    if (trackerItem && trackerItem.slug === trackerItemSlug) {
      content = (
        <TrackerItemScreen
          item={trackerItem}
          onBack={() => showTracker(trackerProject)}
          onAttachSession={() => handleAttachSession(trackerItem)}
          onStageAction={() => handleStageAction(trackerItem)}
        />
      );
    }
  }

  // Routes are exact-match; the worktree list only fires for mode='list'. See
  // UIContext.showArchiveConfirmation for why a catch-all fallback would race.
  if (!content && mode === 'list') {
    content = (
      <WorktreeListScreen
        onCreateFeature={handleCreateFeature}
        onArchiveFeature={handleArchiveFeature}
        onHelp={showHelp}
        onBranch={handleBranch}
        onDiff={handleDiff}
        onQuit={handleTracker}
        onExecuteRun={handleExecuteRun}
        onSettings={handleSettings}
        onTracker={handleTracker}
      />
    );
  }
  if (!content) content = <Box flexGrow={1} />;

  // Wrap all routed content in a single persistent FullScreen to avoid flicker/blanking
  return (
    <FullScreen>
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
export function TestableApp({ gitService, gitHubService, tmuxService }: { gitService?: any; gitHubService?: any; tmuxService?: any; }) {
  const ghCore = React.useMemo(() => new GitHubCore({ gitHubService, gitService }), [gitHubService, gitService]);
  const wtCore = React.useMemo(() => new WorktreeCore({ git: gitService, tmux: tmuxService }), [gitService, tmuxService]);
  return (
    <InputFocusProvider>
      <GitHubProvider core={ghCore}>
        <WorktreeProvider core={wtCore}>
          <UIProvider>
            <AppContent />
          </UIProvider>
        </WorktreeProvider>
      </GitHubProvider>
    </InputFocusProvider>
  );
}
