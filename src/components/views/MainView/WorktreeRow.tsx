import React, {memo} from 'react';
import {Box, Text} from 'ink';
import type {WorktreeInfo} from '../../../models.js';
import {stringDisplayWidth} from '../../../shared/utils/formatting.js';
import {useHighlightPriority} from './hooks/useHighlightPriority.js';
import {useGitHubContext} from '../../../contexts/GitHubContext.js';
import type {PRStatus} from '../../../models.js';
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
  // Read PR status from provider state; fallback to undefined in standalone renders
  let pr: PRStatus | undefined;
  try {
    const {pullRequests} = useGitHubContext() as any;
    pr = pullRequests?.[worktree.path];
  } catch {
    pr = undefined;
  }
  const highlightInfo = useHighlightPriority(worktree, pr);
  const isDimmed = shouldDimRow(pr);
  
  // Format all data for display
  const data = {
    number: String(globalIndex + 1),
    // Display as: feature [project]
    projectFeature: `${worktree.feature} [${worktree.project}]`,
    ai: getAISymbol(worktree.session?.ai_status || '', worktree.session?.attached || false),
    diff: formatDiffStats(worktree.git?.base_added_lines || 0, worktree.git?.base_deleted_lines || 0),
    changes: formatGitChanges(worktree.git?.ahead || 0, worktree.git?.behind || 0),
    pushed: formatPushStatus(worktree),
    pr: formatPRStatus(pr),
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
  
  // Compute background/foreground colors for cells
  const isPriorityCell = (cellIndex: number): boolean =>
    !!(highlightInfo && cellIndex === highlightInfo.columnIndex);

  const getCellBackground = (cellIndex: number): string | undefined => {
    // For merged/archived rows when selected, show a full-row gray highlight for visibility
    if (selected && isDimmed) return 'gray';
    // Keep priority-highlighted cells with their colored background when not dimmed/selected
    if (isPriorityCell(cellIndex)) return highlightInfo!.color;
    // Otherwise no explicit background; selection (non-dimmed) uses inverse
    return undefined;
  };

  const getCellForeground = (cellIndex: number): string | undefined => {
    // Selected merged/archived rows: gray background + white text for contrast
    if (selected && isDimmed) return 'white';
    // Non-selected merged/archived rows: dimmed text (handled via dimColor), don't force color
    if (isDimmed) return undefined;
    // For selected non-priority cells (non-dimmed), let inverse handle the color
    if (selected && !isPriorityCell(cellIndex)) return undefined;
    const bg = getCellBackground(cellIndex);
    if (!bg) return undefined;
    // Choose readable foregrounds for colored backgrounds
    if (bg === 'yellow' || bg === 'green') return 'black';
    return 'white'; // for blue/red and others
  };

  // Fit and align cell content to fill full cell width so background covers entire cell
  const formatCellText = (text: string, width: number, justify: 'flex-start' | 'center' | 'flex-end'): string => {
    const raw = (text ?? '').trim();
    // Truncate if needed (simple substring, width-calculated earlier for project/feature)
    let visible = raw;
    if (stringDisplayWidth(visible) > width) {
      // keep simple truncation at end
      visible = visible.slice(0, Math.max(0, width));
    }
    const pad = Math.max(0, width - stringDisplayWidth(visible));
    if (justify === 'flex-end') {
      return ' '.repeat(pad) + visible;
    }
    if (justify === 'center') {
      const left = Math.floor(pad / 2);
      const right = pad - left;
      return ' '.repeat(left) + visible + ' '.repeat(right);
    }
    // flex-start
    return visible + ' '.repeat(pad);
  };
  
  // Render helper for the Project/Feature cell to dim bracketed project
  const renderProjectFeatureCell = (text: string, width: number, justify: 'flex-start' | 'center' | 'flex-end') => {
    const raw = (text ?? '').trim();
    let visible = raw;
    if (stringDisplayWidth(visible) > width) {
      visible = visible.slice(0, Math.max(0, width));
    }

    // Expected format: feature [project]; dim the bracketed portion
    const bracketIndex = visible.indexOf('[');
    const left = bracketIndex >= 0 ? visible.slice(0, bracketIndex) : visible;
    // Include brackets if present in "bracketed" segment
    const bracketed = bracketIndex >= 0 ? visible.slice(bracketIndex) : '';

    const contentWidth = stringDisplayWidth(visible);
    const pad = Math.max(0, width - contentWidth);

    if (justify === 'flex-end') {
      return (
        <>
          {' '.repeat(pad)}
          {/* Feature keeps the cell's computed color */}
          <Text color={getCellForeground(1)}>{left}</Text>
          {/* Project (with brackets) dimmed */}
          {bracketed ? <Text dimColor>{bracketed}</Text> : null}
        </>
      );
    }
    if (justify === 'center') {
      const leftPad = Math.floor(pad / 2);
      const rightPad = pad - leftPad;
      return (
        <>
          {' '.repeat(leftPad)}
          <Text color={getCellForeground(1)}>{left}</Text>
          {bracketed ? (
            selected && isDimmed ? <Text color={getCellForeground(1)}>{bracketed}</Text> : <Text dimColor>{bracketed}</Text>
          ) : null}
          {' '.repeat(rightPad)}
        </>
      );
    }
    // flex-start
    return (
      <>
        <Text color={getCellForeground(1)}>{left}</Text>
        {bracketed ? (
          selected && isDimmed ? <Text color={getCellForeground(1)}>{bracketed}</Text> : <Text dimColor>{bracketed}</Text>
        ) : null}
        {' '.repeat(pad)}
      </>
    );
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
            backgroundColor={getCellBackground(cellIndex)}
            color={cellIndex === 1 ? undefined : getCellForeground(cellIndex)}
            dimColor={isDimmed && !selected}
            bold={selected && !isPriorityCell(cellIndex)}
            inverse={selected && !isDimmed && !isPriorityCell(cellIndex)}
          >
            {cellIndex === 1
              ? renderProjectFeatureCell(cell.text, cell.width, cell.justify)
              : formatCellText(cell.text, cell.width, cell.justify)}
          </Text>
        </Box>
      ))}
    </Box>
  );
});

WorktreeRow.displayName = 'WorktreeRow';
