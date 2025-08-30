import React, {useMemo, useCallback} from 'react';
import {Box, Text} from 'ink';
import type {WorktreeInfo} from '../../models.js';
import {calculatePaginationInfo, calculatePageSize} from '../../utils/pagination.js';
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
  const {rows: terminalRows, columns: terminalWidth} = useTerminalDimensions();
  
  // Safety net: clamp visible rows to actual terminal capacity
  // FullScreen intentionally leaves one row free to avoid bottom-line scroll.
  const effectiveRows = Math.max(1, terminalRows - 1);
  const maxVisibleRows = calculatePageSize(effectiveRows, terminalWidth);
  const safePageSize = Math.max(1, Math.min(pageSize, maxVisibleRows));

  const columnWidths = useColumnWidths(worktrees, terminalWidth, page, safePageSize);
  
  const paginationInfo = useMemo(() => 
    // Keep pagination info based on requested pageSize for stability
    calculatePaginationInfo(worktrees.length, page, pageSize),
    [worktrees.length, page, pageSize]
  );
  
  const pageItems = useMemo(() => {
    const start = page * pageSize;
    return worktrees.slice(start, start + safePageSize);
  }, [worktrees, page, pageSize, safePageSize]);
  
  const headerText = useMemo(() => {
    // Keep header compact and single-line to avoid wrapping
    // Pagination details are shown in the footer when applicable
    return 'Enter attach, n new, a archive, x exec, d diff, s shell, q quit';
  }, []);
  
  const getRowKey = useCallback((worktree: WorktreeInfo, index: number) => 
    getWorktreeKey(worktree, index), []
  );
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
      <Box marginBottom={1}>
        <Text color="magenta" wrap="truncate">{headerText}</Text>
      </Box>
      
      <TableHeader columnWidths={columnWidths} />
      
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
      
      <PaginationFooter
        totalPages={paginationInfo.totalPages}
        paginationText={paginationInfo.paginationText}
      />
    </Box>
  );
}
