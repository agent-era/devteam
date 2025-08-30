import React, {memo} from 'react';
import {Box, Text} from 'ink';
import type {WorktreeInfo} from '../../../models.js';
import {stringDisplayWidth} from '../../../shared/utils/formatting.js';
import {useHighlightPriority} from './hooks/useHighlightPriority.js';
import {
  formatDiffStats,
  formatGitChanges,
  formatPushStatus,
  getAISymbol,
  formatPRStatus,
  shouldDimRow,
} from './utils.js';
import type {ColumnWidths} from './hooks/useColumnWidths.js';

interface WorktreeRowProps {
  worktree: WorktreeInfo;
  index: number;
  globalIndex: number;
  selected: boolean;
  columnWidths: ColumnWidths;
}

export const WorktreeRow = memo<WorktreeRowProps>(({
  worktree,
  index,
  globalIndex,
  selected,
  columnWidths,
}) => {
  const highlightInfo = useHighlightPriority(worktree);
  const isDimmed = shouldDimRow(worktree.pr);
  
  // Format all data for display
  const data = {
    number: String(globalIndex + 1),
    projectFeature: `${worktree.project}/${worktree.feature}`,
    ai: getAISymbol(worktree.session?.claude_status || '', worktree.session?.attached || false),
    diff: formatDiffStats(worktree.git?.base_added_lines || 0, worktree.git?.base_deleted_lines || 0),
    changes: formatGitChanges(worktree.git?.ahead || 0, worktree.git?.behind || 0),
    pushed: formatPushStatus(worktree),
    pr: formatPRStatus(worktree.pr),
  };
  
  // Truncate PROJECT/FEATURE if it's too long
  const truncatedProjectFeature = stringDisplayWidth(data.projectFeature) > columnWidths.projectFeature 
    ? data.projectFeature.slice(0, Math.max(0, columnWidths.projectFeature - 3)) + '...'
    : data.projectFeature;
  
  // Prepare cell data with colors
  const cells = [
    {text: data.number, width: columnWidths.number, justify: 'flex-start' as const},
    {text: truncatedProjectFeature, width: columnWidths.projectFeature, justify: 'flex-start' as const},
    {text: data.ai, width: columnWidths.ai, justify: 'center' as const},
    {text: data.diff, width: columnWidths.diff, justify: 'flex-end' as const},
    {text: data.changes, width: columnWidths.changes, justify: 'flex-end' as const},
    {text: data.pushed, width: columnWidths.pushed, justify: 'center' as const},
    {text: data.pr, width: columnWidths.pr, justify: 'flex-start' as const},
  ];
  
  // Apply highlighting
  const getCellColor = (cellIndex: number) => {
    if (isDimmed) return 'gray';
    if (highlightInfo && cellIndex === highlightInfo.columnIndex) return highlightInfo.color;
    return undefined;
  };
  
  // Common text props
  const textProps = {
    backgroundColor: selected ? 'blue' : undefined,
    bold: selected,
  };
  
  return (
    <Box key={`worktree-${globalIndex}`}>
      {cells.map((cell, cellIndex) => (
        <Box
          key={cellIndex}
          width={cell.width}
          justifyContent={cell.justify}
          marginRight={cellIndex < cells.length - 1 ? 1 : 0}
        >
          <Text 
            {...textProps}
            color={getCellColor(cellIndex)}
            wrap="truncate"
          >
            {cell.text.trim()}
          </Text>
        </Box>
      ))}
    </Box>
  );
});

WorktreeRow.displayName = 'WorktreeRow';
