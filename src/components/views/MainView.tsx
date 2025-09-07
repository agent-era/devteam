import React, {useMemo, useCallback, useRef, useEffect, useState} from 'react';
import {Box, Text, measureElement} from 'ink';
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
  onMeasuredPageSize?: (pageSize: number) => void;
}

export default function MainView({
  worktrees,
  selectedIndex,
  mode,
  prompt,
  message,
  page = 0,
  onMeasuredPageSize
}: Props) {
  const {rows: terminalRows, columns: terminalWidth} = useTerminalDimensions();

  // Measure-based calculation to ensure we don't render more rows than fit.
  const listRef = useRef<any>(null);
  const [measuredPageSize, setMeasuredPageSize] = useState<number>(Math.max(1, worktrees?.length || 1));

  const columnWidths = useColumnWidths(worktrees, terminalWidth, page, measuredPageSize);
  
  // Use measured page size for pagination info to align with what's rendered
  const paginationInfo = useMemo(() => 
    // Keep pagination info based on requested pageSize for stability
    calculatePaginationInfo(worktrees.length, page, measuredPageSize),
    [worktrees.length, page, measuredPageSize]
  );
  
  const pageItems = useMemo(() => {
    if (!worktrees || worktrees.length === 0) return [];
    const start = page * measuredPageSize;
    // Clamp to the measured page size to avoid rendering more rows than fit
    return worktrees.slice(start, start + measuredPageSize);
  }, [worktrees, page, measuredPageSize]);
  
  const headerText = useMemo(() => {
    // Keep header compact and single-line to avoid wrapping
    // Pagination details are shown in the footer when applicable
    return 'Enter attach, n new, a archive, x exec, d diff, s shell, q quit';
  }, []);
  
  const getRowKey = useCallback((worktree: WorktreeInfo, index: number) => 
    getWorktreeKey(worktree, index), []
  );

  // After render and on resize, measure the list container height to determine how many rows fit
  useEffect(() => {
    const measureAndUpdate = () => {
      const h = listRef.current ? measureElement(listRef.current).height : 0;
      if (h > 0 && h !== measuredPageSize) {
        setMeasuredPageSize(h);
        onMeasuredPageSize?.(h);
      }
    };
    // Measure now and on next tick to ensure Yoga layout has settled
    measureAndUpdate();
    const t = setTimeout(measureAndUpdate, 0);
    return () => clearTimeout(t);
    // Re-measure when terminal size changes or item count might affect footer visibility
  }, [terminalRows, terminalWidth, worktrees.length, onMeasuredPageSize]);

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
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text color="magenta" wrap="truncate">{headerText}</Text>
      </Box>
      
      <TableHeader columnWidths={columnWidths} />

      <Box ref={listRef} flexDirection="column" flexGrow={1}>
        {pageItems.map((worktree, index) => {
          const globalIndex = page * measuredPageSize + index;
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
      </Box>
      
      <PaginationFooter
        totalPages={paginationInfo.totalPages}
        paginationText={paginationInfo.paginationText}
      />
    </Box>
  );
}
