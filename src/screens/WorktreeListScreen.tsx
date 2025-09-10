import React, {useState, useEffect} from 'react';
import {Box} from 'ink';
import MainView from '../components/views/MainView.js';
import {useWorktreeContext} from '../contexts/WorktreeContext.js';
import {useGitHubContext} from '../contexts/GitHubContext.js';
import {useInputFocus} from '../contexts/InputFocusContext.js';
import {useUIContext} from '../contexts/UIContext.js';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts.js';
// Page size is measured directly in MainView to avoid heuristics
import {VISIBLE_STATUS_REFRESH_DURATION} from '../constants.js';


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
  const [pageSize, setPageSize] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasProjects, setHasProjects] = useState<boolean>(false);

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

  // Keep GitHub context informed of which worktrees are visible (current page)
  useEffect(() => {
    const startIndex = currentPage * pageSize;
    const endIndex = Math.min(startIndex + pageSize, worktrees.length);
    const visiblePaths = worktrees.slice(startIndex, endIndex).map(w => w.path);
    setVisibleWorktrees(visiblePaths);
  }, [worktrees, currentPage, pageSize, setVisibleWorktrees]);

  // Ensure the page shows the currently selected item (e.g., after reattaching)
  useEffect(() => {
    if (pageSize <= 0 || worktrees.length === 0) return;
    const start = currentPage * pageSize;
    const end = Math.min(start + pageSize - 1, Math.max(0, worktrees.length - 1));
    if (selectedIndex < start || selectedIndex > end) {
      const newPage = Math.floor(selectedIndex / pageSize);
      if (Number.isFinite(newPage) && newPage !== currentPage) {
        setCurrentPage(newPage);
      }
    }
  }, [selectedIndex, pageSize, worktrees.length, currentPage]);

  // Single loop to refresh git+AI status for visible rows only
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isAnyDialogFocused) {
        refreshVisibleStatus(currentPage, pageSize).catch(() => {});
      }
    }, VISIBLE_STATUS_REFRESH_DURATION);
    return () => clearInterval(interval);
  }, [currentPage, pageSize, refreshVisibleStatus, isAnyDialogFocused]);

  const handleMove = (delta: number) => {
    const nextIndex = selectedIndex + delta;
    
    // Handle page boundaries
    if (nextIndex < 0) {
      // If page size isn't established yet (<=1), treat as single page navigation
      if (pageSize <= 1) {
        setCurrentPage(0);
        selectWorktree(Math.max(0, worktrees.length - 1));
        return;
      }
      // Move to previous page, select last item of that page
      const totalPages = Math.max(1, Math.ceil(worktrees.length / pageSize));
      const newPage = currentPage > 0 ? currentPage - 1 : totalPages - 1;
      const lastItemOnPage = Math.min((newPage + 1) * pageSize - 1, worktrees.length - 1);
      setCurrentPage(newPage);
      selectWorktree(lastItemOnPage);
    } else if (nextIndex >= worktrees.length) {
      // Wrap to first page, first item
      setCurrentPage(0);
      selectWorktree(0);
    } else if (nextIndex >= (currentPage + 1) * pageSize) {
      // If page size isn't established yet (<=1), avoid advancing to a blank page
      if (pageSize <= 1) {
        selectWorktree(nextIndex);
        return;
      }
      // Move to next page, select first item of that page
      const totalPages = Math.max(1, Math.ceil(worktrees.length / pageSize));
      const newPage = (currentPage + 1) % totalPages;
      setCurrentPage(newPage);
      selectWorktree(Math.min(newPage * pageSize, worktrees.length - 1));
    } else if (nextIndex < currentPage * pageSize) {
      // If page size isn't established yet (<=1), avoid moving pages
      if (pageSize <= 1) {
        selectWorktree(Math.max(0, nextIndex));
        return;
      }
      // Move to previous page, select last item of that page
      const newPage = currentPage > 0 ? currentPage - 1 : Math.max(0, Math.ceil(worktrees.length / pageSize) - 1);
      const lastItemOnPage = Math.min((newPage + 1) * pageSize - 1, worktrees.length - 1);
      setCurrentPage(newPage);
      selectWorktree(lastItemOnPage);
    } else {
      // Normal movement within current page
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
    // Always move by half a page, regardless of total pages
    const halfPageSize = Math.floor(pageSize / 2);
    const newIndex = Math.max(0, selectedIndex - halfPageSize);
    const newPage = Math.floor(newIndex / pageSize);
    setCurrentPage(newPage);
    selectWorktree(newIndex);
  };

  const handleNextPage = () => {
    // Always move by half a page, regardless of total pages
    const halfPageSize = Math.floor(pageSize / 2);
    const newIndex = Math.min(worktrees.length - 1, selectedIndex + halfPageSize);
    const newPage = Math.floor(newIndex / pageSize);
    setCurrentPage(newPage);
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
    setCurrentPage(0);  // First item is always on page 0
    selectWorktree(0);
  };

  const handleJumpToLast = () => {
    if (worktrees.length > 0) {
      const lastIndex = worktrees.length - 1;
      const lastPage = Math.floor(lastIndex / pageSize);
      setCurrentPage(lastPage);  // Navigate to the page containing the last item
      selectWorktree(lastIndex);
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
