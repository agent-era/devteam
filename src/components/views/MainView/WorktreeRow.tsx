import React, {memo} from 'react';
import {Box, Text} from 'ink';
import type {WorktreeInfo} from '../../../models.js';
import {stringDisplayWidth} from '../../../shared/utils/formatting.js';
import {useHighlightPriority} from './hooks/useHighlightPriority.js';
import {useGitHubContext} from '../../../contexts/GitHubContext.js';
import type {PRStatus} from '../../../models.js';
import { formatDiffStats, formatGitChanges, getAISymbol, formatPRStatus, shouldDimRow } from './utils.js';
import type {ColumnWidths} from './hooks/useColumnWidths.js';
import StatusChip from '../../common/StatusChip.js';
import {getStatusMeta, StatusReason} from './highlight.js';

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
    // Number column: always show index, including for workspace children
    number: String(globalIndex + 1),
    // Branch name column: show tree glyph + [project] for children; otherwise feature [project]
    projectFeature: worktree.is_workspace_child
      ? `${worktree.is_last_workspace_child ? '└─' : '├─'} [${worktree.project}]`
      : `${worktree.feature} [${worktree.project}]`,
    ai: getAISymbol(worktree.session?.ai_status || '', worktree.session?.attached || false),
    diff: formatDiffStats(worktree.git?.base_added_lines || 0, worktree.git?.base_deleted_lines || 0),
    changes: formatGitChanges(worktree.git?.ahead || 0, worktree.git?.behind || 0),
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
    {text: data.pr, width: columnWidths.pr, justify: 'flex-end' as const},
  ];
  const statusMeta = getStatusMeta(worktree, pr);
  
  // Compute background/foreground colors for cells
  const isPriorityCell = (cellIndex: number): boolean =>
    !!(highlightInfo && cellIndex === highlightInfo.columnIndex);

  const getCellBackground = (cellIndex: number): string | undefined => {
    // Selected merged/archived rows: full-row gray highlight for visibility
    if (selected && isDimmed) return 'gray';
    // No background highlight for priority cells; emphasize via text color instead
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
    // Color the applicable column's text
    if (isPriorityCell(cellIndex)) {
      // Apply explicit text colors per status reason for the applicable column
      switch (highlightInfo?.reason) {
        case StatusReason.AGENT_WAITING:
          return 'yellow';
        case StatusReason.AGENT_READY:
          return 'green';
        case StatusReason.UNCOMMITTED_CHANGES:
          return 'blue';
        case StatusReason.UNPUSHED_COMMITS:
          return 'cyan';
        case StatusReason.PR_CONFLICTS:
        case StatusReason.PR_FAILING:
          return 'red';
        case StatusReason.PR_READY_TO_MERGE:
          return 'green';
        case StatusReason.PR_CHECKING:
          return 'magenta';
        case StatusReason.NO_PR:
          return 'cyan';
        case StatusReason.PR_MERGED:
          return 'gray';
        default:
          // Fallback to STATUS chip text color
          return statusMeta.fg;
      }
    }
    return undefined;
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

    // Dim the bracketed portion (project/workspace) like other rows
    // When the whole row is dimmed, avoid double-dimming the bracket
    const renderBracket = (content: string) => <Text dimColor={!isDimmed || selected}>{content}</Text>;

    if (justify === 'flex-end') {
      return (
        <>
          {' '.repeat(pad)}
          {/* Feature keeps the cell's computed color */}
          <Text color={getCellForeground(1)} dimColor={isDimmed && !selected}>{left}</Text>
          {/* Project (with brackets) dimmed */}
          {bracketed ? renderBracket(bracketed) : null}
        </>
      );
    }
    if (justify === 'center') {
      const leftPad = Math.floor(pad / 2);
      const rightPad = pad - leftPad;
      return (
        <>
          {' '.repeat(leftPad)}
          <Text color={getCellForeground(1)} dimColor={isDimmed && !selected}>{left}</Text>
          {bracketed ? (selected && isDimmed
            ? <Text color={getCellForeground(1)}>{bracketed}</Text>
            : renderBracket(bracketed))
          : null}
          {' '.repeat(rightPad)}
        </>
      );
    }
    // flex-start
    return (
      <>
        <Text color={getCellForeground(1)} dimColor={isDimmed && !selected}>{left}</Text>
        {bracketed ? (selected && isDimmed
          ? <Text color={getCellForeground(1)}>{bracketed}</Text>
          : renderBracket(bracketed))
        : null}
        {' '.repeat(pad)}
      </>
    );
  };

  return (
    <Box key={`worktree-${globalIndex}`}>
      {/* First column: # */}
      <Box
        width={cells[0].width}
        justifyContent={cells[0].justify}
        marginRight={1}
      >
        <Text
          backgroundColor={getCellBackground(0)}
          color={getCellForeground(0)}
          dimColor={isDimmed && !selected}
          bold={selected && !isPriorityCell(0)}
          inverse={selected && !isPriorityCell(0) && !isDimmed}
        >
          {formatCellText(cells[0].text, cells[0].width, cells[0].justify)}
        </Text>
      </Box>

      {/* Second column: STATUS */}
      <Box width={columnWidths.status} justifyContent="flex-start" marginRight={1}>
        <StatusChip label={statusMeta.label || ''} color={statusMeta.bg} fg={statusMeta.fg} width={columnWidths.status} />
      </Box>

      {/* Remaining columns from cells[1..] */}
      {cells.slice(1).map((cell, offsetIndex, arr) => {
        const cellIndex = offsetIndex + 1; // original index in cells array
        const isLast = offsetIndex === arr.length - 1;
        return (
          <Box
            key={cellIndex}
            width={cell.width}
            justifyContent={cell.justify}
            marginRight={isLast ? 0 : 1}
          >
            <Text
              backgroundColor={getCellBackground(cellIndex)}
              color={cellIndex === 1 ? undefined : getCellForeground(cellIndex)}
              dimColor={isDimmed && !selected}
              bold={selected && !isPriorityCell(cellIndex)}
              inverse={selected && !isPriorityCell(cellIndex) && !isDimmed}
            >
              {cellIndex === 1
                ? renderProjectFeatureCell(cell.text, cell.width, cell.justify)
                : formatCellText(cell.text, cell.width, cell.justify)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
});

WorktreeRow.displayName = 'WorktreeRow';
