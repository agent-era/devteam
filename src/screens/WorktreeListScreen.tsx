import React, {useState, useEffect, useMemo} from 'react';
import {Box} from 'ink';
import MainView from '../components/views/MainView.js';
import {useWorktreeContext} from '../contexts/WorktreeContext.js';
import {useGitHubContext} from '../contexts/GitHubContext.js';
import {useInputFocus} from '../contexts/InputFocusContext.js';
import {useUIContext} from '../contexts/UIContext.js';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts.js';
// Page size is measured directly in MainView to avoid heuristics
import {VISIBLE_STATUS_REFRESH_DURATION} from '../constants.js';
import {isAppIntervalsEnabled} from '../config.js';
import {startIntervalIfEnabled} from '../shared/utils/intervals.js';
import {useTerminalDimensions} from '../hooks/useTerminalDimensions.js';
import {calculatePageSize} from '../utils/pagination.js';


interface WorktreeListScreenProps {
  onCreateFeature: () => void;
  onArchiveFeature: () => void;
  onHelp: () => void;
  onBranch: () => void;
  onDiff: (type: 'full' | 'uncommitted') => void;
  onQuit: () => void;
  onExecuteRun: () => void;
  onConfigureRun: () => void;
}

export default function WorktreeListScreen({
  onCreateFeature,
  onArchiveFeature,
  onHelp,
  onBranch,
  onDiff,
  onQuit,
  onExecuteRun,
  onConfigureRun
}: WorktreeListScreenProps) {
  const {worktrees, selectedIndex, selectWorktree, refresh, refreshVisibleStatus, forceRefreshVisible, attachSession, attachShellSession, attachWorkspaceSession, needsToolSelection, lastRefreshed, memoryStatus, versionInfo, discoverProjects} = useWorktreeContext();
  const {setVisibleWorktrees} = useGitHubContext();
  const {isAnyDialogFocused} = useInputFocus();
  const {showAIToolSelection, showList, runWithLoading, showInfo} = useUIContext();
  // Seed page size with a realistic fallback based on terminal dimensions
  // to avoid early navigation using a placeholder value (which can cause
  // page jumps once the measured size arrives from MainView).
  const {rows: termRows, columns: termCols} = useTerminalDimensions();
  const [pageSize, setPageSize] = useState<number>(() => calculatePageSize(termRows, termCols));
  const [hasProjects, setHasProjects] = useState<boolean>(false);
  
  // Derive currentPage from selectedIndex and pageSize to eliminate timing issues
  const currentPage = useMemo(() => {
    if (pageSize <= 0 || worktrees.length === 0) return 0;
    return Math.floor(selectedIndex / pageSize);
  }, [selectedIndex, pageSize, worktrees.length]);

  // Refresh data when component mounts, but only if data is missing or very stale
  useEffect(() => {
    const isDataStale = !lastRefreshed || (Date.now() - lastRefreshed > 30000); // 30 seconds
    const isDataEmpty = !worktrees || worktrees.length === 0;
    
    if (isDataEmpty || isDataStale) {
      refresh('none').catch(() => {});
    }
  }, []); // Only on mount

  // Detect whether any projects are available (used for zero-state message)
  useEffect(() => {
    try {
      const projects = discoverProjects();
      setHasProjects(Array.isArray(projects) && projects.length > 0);
    } catch {
      setHasProjects(false);
    }
  }, []);

  // Inform GitHub context when the set of visible worktrees changes.
  // Only pass paths for worktrees actually visible on the current page.
  const visibleWorktreePaths = React.useMemo(() => {
    const start = currentPage * pageSize;
    const end = start + pageSize;
    return worktrees.slice(start, end).map(w => w.path).sort();
  }, [worktrees, currentPage, pageSize]);
  useEffect(() => {
    setVisibleWorktrees(visibleWorktreePaths);
  }, [visibleWorktreePaths, setVisibleWorktrees]);

  // currentPage is now derived, so no manual synchronization needed

  // Single loop to refresh git+AI status for visible rows only
  useEffect(() => {
    if (!isAppIntervalsEnabled()) return;
    const clear = startIntervalIfEnabled(() => {
      if (!isAnyDialogFocused) {
        refreshVisibleStatus(currentPage, pageSize).catch(() => {});
      }
    }, VISIBLE_STATUS_REFRESH_DURATION);
    return clear;
  }, [currentPage, pageSize, refreshVisibleStatus, isAnyDialogFocused]);

  const handleMove = (delta: number) => {
    const nextIndex = selectedIndex + delta;
    
    // Handle wrapping at boundaries
    if (nextIndex < 0) {
      // Wrap to last item
      selectWorktree(Math.max(0, worktrees.length - 1));
    } else if (nextIndex >= worktrees.length) {
      // Wrap to first item
      selectWorktree(0);
    } else {
      // Normal movement - page will be derived automatically
      selectWorktree(nextIndex);
    }
  };

  const handleSelect = async () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (!selectedWorktree) return;
    
    try {
      // If a workspace child is selected, inform and attach/create the parent workspace session
      if ((selectedWorktree as any).is_workspace_child) {
        const feature = (selectedWorktree as any).parent_feature || selectedWorktree.feature;
        showInfo(`Opening workspace session for '${feature}'.\nChild sessions are handled in the workspace.`, {
          title: 'Workspace Session',
          onClose: () => runWithLoading(() => attachWorkspaceSession(feature))
        });
        return;
      }
      // Check if tool selection is needed
      const needsSelection = await needsToolSelection(selectedWorktree);
      
      if (needsSelection) {
        // Show AI tool selection dialog
        showAIToolSelection(selectedWorktree);
      } else {
        // Proceed with session attachment immediately (no tmux hint)
        runWithLoading(() => attachSession(selectedWorktree));
      }
    } catch (error) {
      console.error('Failed to handle selection:', error);
    }
  };

  const handleShell = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (!selectedWorktree) return;
    
    try {
      runWithLoading(() => attachShellSession(selectedWorktree));
    } catch {}
  };

  const handleDiffFull = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (selectedWorktree) {
      if ((selectedWorktree as any).is_workspace_header) {
        showInfo('Diff is per project. Select a project row.', {title: 'Workspace Diff'});
        return;
      }
      onDiff('full');
    }
  };

  const handleDiffUncommitted = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (selectedWorktree) {
      if ((selectedWorktree as any).is_workspace_header) {
        showInfo('Diff is per project. Select a project row.', {title: 'Workspace Diff'});
        return;
      }
      onDiff('uncommitted');
    }
  };

  const handlePreviousPage = () => {
    if (pageSize <= 0 || worktrees.length === 0) return;
    const halfPage = Math.max(1, Math.floor(pageSize / 2));
    const newIndex = Math.max(0, selectedIndex - halfPage);
    selectWorktree(newIndex);
  };

  const handleNextPage = () => {
    if (pageSize <= 0 || worktrees.length === 0) return;
    const halfPage = Math.max(1, Math.floor(pageSize / 2));
    const newIndex = Math.min(worktrees.length - 1, selectedIndex + halfPage);
    selectWorktree(newIndex);
  };

  const handleExecuteRunWrapped = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (selectedWorktree && (selectedWorktree as any).is_workspace_header) {
      showInfo('Run is per project. Select a project row.', {title: 'Workspace Run'});
      return;
    }
    onExecuteRun();
  };

  const handleConfigureRunWrapped = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (selectedWorktree && (selectedWorktree as any).is_workspace_header) {
      showInfo('Run is per project. Select a project row.', {title: 'Workspace Run'});
      return;
    }
    onConfigureRun();
  };

  const handleRefresh = async () => {
    // Force refresh visible PRs, ignoring cache TTLs
    await forceRefreshVisible(currentPage, pageSize);
  };

  const handleUpdate = async () => {
    try {
      if (!versionInfo || !versionInfo.hasUpdate) return;
      // Use npm to install latest globally, then restart the app in background
      // Show progress in terminal
      const pkg = '@agent-era/devteam';
      // Synchronous interactive install
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {runInteractive, runCommandQuick} = await import('../shared/utils/commandExecutor.js');
      runInteractive('npm', ['install', '-g', pkg]);
      // Try to relaunch the CLI in the background to avoid nested TUIs
      const relaunch = 'command -v devteam >/dev/null 2>&1 && nohup devteam >/dev/null 2>&1 & disown || nohup node dist/bin/devteam.js >/dev/null 2>&1 & disown';
      runCommandQuick(['bash', '-lc', relaunch]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Update failed:', err);
    } finally {
      onQuit();
    }
  };

  const handleJumpToFirst = () => {
    selectWorktree(0);
  };

  const handleJumpToLast = () => {
    if (worktrees.length > 0) {
      selectWorktree(worktrees.length - 1);
    }
  };

  useKeyboardShortcuts({
    onMove: handleMove,
    onSelect: handleSelect,
    onCreate: onCreateFeature,
    onArchive: onArchiveFeature,
    onRefresh: handleRefresh,
    onHelp: onHelp,
    onBranch: onBranch,
    onShell: handleShell,
    onDiff: handleDiffFull,
    onDiffUncommitted: handleDiffUncommitted,
    onPreviousPage: handlePreviousPage,
    onNextPage: handleNextPage,
    onJumpToFirst: handleJumpToFirst,
    onJumpToLast: handleJumpToLast,
    onQuit: onQuit,
    onExecuteRun: handleExecuteRunWrapped,
    onConfigureRun: handleConfigureRunWrapped,
    onUpdate: handleUpdate
  }, {
    page: currentPage,
    pageSize,
    selectedIndex,
    totalItems: worktrees.length
  });

  return (
    <MainView
      worktrees={worktrees}
      selectedIndex={selectedIndex}
      onMove={handleMove}
      onSelect={handleSelect}
      onQuit={onQuit}
      page={currentPage}
      onMeasuredPageSize={setPageSize}
      memoryStatus={memoryStatus}
      versionInfo={versionInfo}
      hasProjects={hasProjects}
    />
  );
}
