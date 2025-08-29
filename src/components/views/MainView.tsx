import React, {useMemo, useCallback} from 'react';
import {Box, Text} from 'ink';
import type {WorktreeInfo} from '../../models.js';
import {calculatePaginationInfo} from '../../utils/pagination.js';
import {useTerminalDimensions} from '../../hooks/useTerminalDimensions.js';
import {useColumnWidths} from './MainView/hooks/useColumnWidths.js';
import {WorktreeRow} from './MainView/WorktreeRow.js';
import {TableHeader} from './MainView/TableHeader.js';
import {PaginationFooter} from './MainView/PaginationFooter.js';
import {EmptyState} from './MainView/EmptyState.js';
import {MessageView} from './MainView/MessageView.js';
import {PromptView} from './MainView/PromptView.js';
import {getWorktreeKey} from './MainView/utils.js';

type Prompt = {title?: string; text?: string; hint?: string};

interface Props {
  worktrees: WorktreeInfo[];
  selectedIndex: number;
  onMove?: (delta: number) => void;
  onSelect?: (index: number) => void;
  onQuit?: () => void;
  mode?: 'message' | 'prompt';
  prompt?: Prompt;
  message?: string;
  page?: number;
  pageSize?: number;
}

export default function MainView({
  worktrees,
  selectedIndex,
  mode,
  prompt,
  message,
  page = 0,
  pageSize = 20
}: Props) {
  const {columns: terminalWidth} = useTerminalDimensions();
  
  // Calculate column widths (memoized based on data and terminal size)
  // Always call this hook to maintain consistent hook order
  const columnWidths = useColumnWidths(worktrees, terminalWidth, page, pageSize);
  
  // Calculate pagination info
  const paginationInfo = useMemo(() => 
    calculatePaginationInfo(worktrees.length, page, pageSize),
    [worktrees.length, page, pageSize]
  );
  
  // Get current page items
  const pageItems = useMemo(() => {
    const start = page * pageSize;
    return worktrees.slice(start, start + pageSize);
  }, [worktrees, page, pageSize]);
  
  // Render header with pagination info
  const headerText = useMemo(() => {
    const base = 'Enter attach, n new, a archive, x exec, d diff, s shell, q quit';
    return `${base}${paginationInfo.paginationText}`;
  }, [paginationInfo.paginationText]);
  
  // Stable key generation for rows
  const getRowKey = useCallback((worktree: WorktreeInfo, index: number) => 
    getWorktreeKey(worktree, index), []
  );
  
  // Early returns AFTER all hooks to maintain consistent hook order
  if (mode === 'message') {
    return <MessageView message={message} />;
  }
  
  if (mode === 'prompt') {
    return <PromptView prompt={prompt} />;
  }
  
  if (!worktrees.length) {
    return <EmptyState />;
  }
  
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="magenta">{headerText}</Text>
      </Box>
      
      {/* Table Header */}
      <TableHeader columnWidths={columnWidths} />
      
      {/* Table Rows */}
      {pageItems.map((worktree, index) => {
        const globalIndex = page * pageSize + index;
        const isSelected = globalIndex === selectedIndex;
        
        return (
          <WorktreeRow
            key={getRowKey(worktree, index)}
            worktree={worktree}
            index={index}
            globalIndex={globalIndex}
            selected={isSelected}
            columnWidths={columnWidths}
          />
        );
      })}
      
      {/* Pagination Footer */}
      <PaginationFooter
        totalPages={paginationInfo.totalPages}
        paginationText={paginationInfo.paginationText}
      />
    </Box>
  );
}