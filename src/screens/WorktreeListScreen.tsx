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
      if (!s.worktrees.length) return s;
      
      let nextIndex = s.selectedIndex + delta;
      const totalItems = s.worktrees.length;
      
      // Clamp to valid range
      nextIndex = Math.max(0, Math.min(totalItems - 1, nextIndex));
      
      // Calculate which page this index belongs to
      const targetPage = Math.floor(nextIndex / s.pageSize);
      
      return {
        ...s, 
        selectedIndex: nextIndex,
        page: targetPage
      };
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
      if (!st.worktrees.length) return st;
      
      const totalPages = Math.ceil(st.worktrees.length / st.pageSize);
      if (totalPages <= 1) return st;
      
      const prevPage = st.page === 0 ? totalPages - 1 : st.page - 1;
      const startIndex = prevPage * st.pageSize;
      const newIndex = Math.min(startIndex, st.worktrees.length - 1);
      
      return {...st, page: prevPage, selectedIndex: newIndex};
    });
  };

  const handleNextPage = () => {
    setState(st => {
      if (!st.worktrees.length) return st;
      
      const totalPages = Math.ceil(st.worktrees.length / st.pageSize);
      if (totalPages <= 1) return st;
      
      const nextPage = (st.page + 1) % totalPages;
      const startIndex = nextPage * st.pageSize;
      const newIndex = Math.min(startIndex, st.worktrees.length - 1);
      
      return {...st, page: nextPage, selectedIndex: newIndex};
    });
  };

  const handleJumpToFirst = () => {
    setState(st => ({
      ...st,
      selectedIndex: 0,
      page: 0
    }));
  };

  const handleJumpToLast = () => {
    setState(st => {
      if (!st.worktrees.length) return st;
      
      const lastIndex = st.worktrees.length - 1;
      const lastPage = Math.floor(lastIndex / st.pageSize);
      
      return {
        ...st,
        selectedIndex: lastIndex,
        page: lastPage
      };
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
    onJumpToFirst: handleJumpToFirst,
    onJumpToLast: handleJumpToLast,
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