import React from 'react';
import {Box} from 'ink';
import MainView from '../components/views/MainView.js';
import {useWorktreeContext} from '../contexts/WorktreeContext.js';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts.js';

const h = React.createElement;

interface WorktreeListScreenProps {
  onCreateFeature: () => void;
  onArchiveFeature: () => void;
  onViewArchived: () => void;
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
  onViewArchived,
  onHelp,
  onBranch,
  onDiff,
  onQuit,
  onExecuteRun,
  onConfigureRun
}: WorktreeListScreenProps) {
  const {worktrees, selectedIndex, selectWorktree, refresh, refreshPRSelective, attachSession, attachShellSession} = useWorktreeContext();

  const handleMove = (delta: number) => {
    const nextIndex = Math.max(0, Math.min(worktrees.length - 1, selectedIndex + delta));
    selectWorktree(nextIndex);
  };

  const handleSelect = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (!selectedWorktree) return;
    
    try {
      attachSession(selectedWorktree);
    } catch {}
    
    refresh();
  };

  const handleShell = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (!selectedWorktree) return;
    
    try {
      attachShellSession(selectedWorktree);
    } catch {}
    
    refresh();
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
    // Pagination is now handled by the MainView component
    // This could be extended to support pagination in the future
  };

  const handleNextPage = () => {
    // Pagination is now handled by the MainView component  
    // This could be extended to support pagination in the future
  };

  const handleRefresh = async () => {
    // Full refresh: both worktrees and PR status
    await refresh();
    // Then selective PR refresh for visible items
    await refreshPRSelective();
  };

  useKeyboardShortcuts({
    onMove: handleMove,
    onSelect: handleSelect,
    onCreate: onCreateFeature,
    onArchive: onArchiveFeature,
    onRefresh: handleRefresh,
    onViewArchived: onViewArchived,
    onHelp: onHelp,
    onBranch: onBranch,
    onShell: handleShell,
    onDiff: handleDiffFull,
    onDiffUncommitted: handleDiffUncommitted,
    onPreviousPage: handlePreviousPage,
    onNextPage: handleNextPage,
    onQuit: onQuit,
    onExecuteRun: onExecuteRun,
    onConfigureRun: onConfigureRun
  }, {
    page: 0,
    pageSize: 20,
    selectedIndex,
    totalItems: worktrees.length
  });

  return h(MainView, {
    worktrees,
    selectedIndex,
    onMove: handleMove,
    onSelect: handleSelect,
    onQuit,
    page: 0,
    pageSize: 20,
  });
}