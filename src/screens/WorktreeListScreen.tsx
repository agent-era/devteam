import React from 'react';
import {Box} from 'ink';
import MainView from '../components/views/MainView.js';
import {useWorktrees} from '../hooks/useWorktrees.js';
import {useServices} from '../contexts/ServicesContext.js';
import {useAppState} from '../contexts/AppStateContext.js';
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
  const {worktrees, refreshWorktrees, selectedIndex, page, pageSize} = useWorktrees();
  const {worktreeService} = useServices();
  const {state, setState} = useAppState();

  const handleMove = (delta: number) => {
    setState(s => {
      const nextIndex = Math.max(0, Math.min(s.worktrees.length - 1, s.selectedIndex + delta));
      return {...s, selectedIndex: nextIndex};
    });
  };

  const handleSelect = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (!selectedWorktree) return;
    
    try {
      worktreeService.attachOrCreateSession(
        selectedWorktree.project, 
        selectedWorktree.feature, 
        selectedWorktree.path
      );
    } catch {}
    
    refreshWorktrees();
  };

  const handleShell = () => {
    const selectedWorktree = worktrees[selectedIndex];
    if (!selectedWorktree) return;
    
    try {
      worktreeService.attachOrCreateShellSession(
        selectedWorktree.project,
        selectedWorktree.feature,
        selectedWorktree.path
      );
    } catch {}
    
    refreshWorktrees();
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
    setState(st => {
      const total = Math.max(1, Math.ceil(st.worktrees.length / st.pageSize));
      const prevPage = (st.page - 1 + total) % total;
      const newIndex = Math.min(prevPage * st.pageSize, st.worktrees.length - 1);
      return {...st, page: prevPage, selectedIndex: newIndex};
    });
  };

  const handleNextPage = () => {
    setState(st => {
      const total = Math.max(1, Math.ceil(st.worktrees.length / st.pageSize));
      const nextPage = (st.page + 1) % total;
      const newIndex = Math.min(nextPage * st.pageSize, st.worktrees.length - 1);
      return {...st, page: nextPage, selectedIndex: newIndex};
    });
  };

  useKeyboardShortcuts({
    onMove: handleMove,
    onSelect: handleSelect,
    onCreate: onCreateFeature,
    onArchive: onArchiveFeature,
    onRefresh: refreshWorktrees,
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
    page,
    pageSize,
    selectedIndex,
    totalItems: worktrees.length
  });

  return h(MainView, {
    worktrees,
    selectedIndex,
    onMove: handleMove,
    onSelect: handleSelect,
    onQuit,
    mode: state.mode,
    message: state.message,
    page,
    pageSize,
  });
}