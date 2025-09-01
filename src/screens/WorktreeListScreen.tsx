import React, {useState, useEffect} from 'react';
import {Box} from 'ink';
import MainView from '../components/views/MainView.js';
import {useWorktreeContext} from '../contexts/WorktreeContext.js';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts.js';
import {usePageSize} from '../hooks/usePagination.js';


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
  const {worktrees, selectedIndex, selectWorktree, refresh, forceRefreshVisible, attachSession, attachShellSession, lastRefreshed} = useWorktreeContext();
  const pageSize = usePageSize();
  const [currentPage, setCurrentPage] = useState(0);

  // Refresh data when component mounts, but only if data is missing or very stale
  useEffect(() => {
    const isDataStale = !lastRefreshed || (Date.now() - lastRefreshed > 30000); // 30 seconds
    const isDataEmpty = !worktrees || worktrees.length === 0;
    
    if (isDataEmpty || isDataStale) {
      refresh('none').catch(() => {});
    }
  }, []); // Only on mount

  const handleMove = (delta: number) => {
    const nextIndex = selectedIndex + delta;
    
    // Handle page boundaries
    if (nextIndex < 0) {
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
      // Move to next page, select first item of that page
      const totalPages = Math.max(1, Math.ceil(worktrees.length / pageSize));
      const newPage = (currentPage + 1) % totalPages;
      setCurrentPage(newPage);
      selectWorktree(newPage * pageSize);
    } else if (nextIndex < currentPage * pageSize) {
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

  const handleSelect = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (!selectedWorktree) return;
    
    try {
      attachSession(selectedWorktree);
    } catch {}
    
    refresh().catch(error => {
      console.error('Refresh after attach failed:', error);
    });
  };

  const handleShell = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (!selectedWorktree) return;
    
    try {
      attachShellSession(selectedWorktree);
    } catch {}
    
    refresh().catch(error => {
      console.error('Refresh after attach failed:', error);
    });
  };

  const handleDiffFull = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (selectedWorktree) {
      onDiff('full');
    }
  };

  const handleDiffUncommitted = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (selectedWorktree) {
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

  const handleRefresh = async () => {
    // Force refresh visible PRs, ignoring cache TTLs
    await forceRefreshVisible(currentPage, pageSize);
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
    onExecuteRun: onExecuteRun,
    onConfigureRun: onConfigureRun
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
      pageSize={pageSize}
    />
  );
}
