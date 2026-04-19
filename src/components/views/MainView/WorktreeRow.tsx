import React, {memo} from 'react';
import {Box, Text} from 'ink';
import type {WorktreeInfo} from '../../../models.js';
import {stringDisplayWidth} from '../../../shared/utils/formatting.js';
import {useHighlightPriority} from './hooks/useHighlightPriority.js';
import type {PRStatus} from '../../../models.js';
import { formatDiffStats, formatGitChanges, formatPRStatus, shouldDimRow } from './utils.js';
import type {ColumnWidths} from './hooks/useColumnWidths.js';
import StatusChip from '../../common/StatusChip.js';
import {getStatusMeta, COLUMNS} from './highlight.js';
import { WorktreeStatusReason as StatusReason } from '../../../cores/WorktreeStatus.js';
import {renderSessionCell} from './SessionCell.js';

interface WorktreeRowProps {
  worktree: WorktreeInfo;
  index: number;
  globalIndex: number;
  selected: boolean;
  columnWidths: ColumnWidths;
  prStatus?: PRStatus;
}

export const WorktreeRow = memo<WorktreeRowProps>(({
  worktree,
  index,
  globalIndex,
  selected,
  columnWidths,
  prStatus,
}) => {
  const highlightInfo = useHighlightPriority(worktree, prStatus);
  const isDimmed = shouldDimRow(prStatus);

  const data = {
    number: String(globalIndex + 1),
    projectFeature: worktree.is_workspace_child
      ? `${worktree.is_last_workspace_child ? '└─' : '├─'} [${worktree.project}]`
      : `${worktree.feature} [${worktree.project}]`,
    diff: formatDiffStats(worktree.git?.base_added_lines || 0, worktree.git?.base_deleted_lines || 0),
    changes: formatGitChanges(worktree.git?.ahead || 0, worktree.git?.behind || 0),
    pr: formatPRStatus(prStatus),
  };

  const agentActive = worktree.session?.attached || false;
  const shellActive = worktree.session?.shell_attached || false;
  const runActive = worktree.session?.run_attached || false;

  // Truncate PROJECT/FEATURE if it's too long
  const truncatedProjectFeature = stringDisplayWidth(data.projectFeature) > columnWidths.projectFeature
    ? data.projectFeature.slice(0, Math.max(0, columnWidths.projectFeature - 3)) + '...'
    : data.projectFeature;

  const cells = [
    {text: data.number, width: columnWidths.number, justify: 'flex-start' as const},
    {text: 'a', width: columnWidths.ai, justify: 'center' as const},
    {text: 's', width: columnWidths.shell, justify: 'center' as const},
    {text: 'x', width: columnWidths.run, justify: 'center' as const},
    {text: truncatedProjectFeature, width: columnWidths.projectFeature, justify: 'flex-start' as const},
    {text: data.diff, width: columnWidths.diff, justify: 'flex-end' as const},
    {text: data.changes, width: columnWidths.changes, justify: 'flex-end' as const},
    {text: data.pr, width: columnWidths.pr, justify: 'flex-end' as const},
  ];
  const statusMeta = getStatusMeta(worktree, prStatus);

  const isPriorityCell = (cellIndex: number): boolean =>
    !!(highlightInfo && cellIndex === highlightInfo.columnIndex);

  const getCellBackground = (cellIndex: number): string | undefined => {
    if (selected && isDimmed) return 'gray';
    if (selected && !isDimmed) return 'white';
    return undefined;
  };

  const getPriorityCellColor = (): string => {
    switch (highlightInfo?.reason) {
      case StatusReason.AGENT_WAITING: return 'yellow';
      case StatusReason.AGENT_READY: return 'white';
      case StatusReason.UNCOMMITTED_CHANGES: return 'blue';
      case StatusReason.UNPUSHED_COMMITS: return 'cyan';
      case StatusReason.PR_CONFLICTS:
      case StatusReason.PR_FAILING: return 'red';
      case StatusReason.PR_READY_TO_MERGE: return 'green';
      case StatusReason.PR_CHECKING: return 'magenta';
      case StatusReason.NO_PR: return 'cyan';
      case StatusReason.PR_MERGED: return 'gray';
      default: return statusMeta.fg;
    }
  };

  const getCellForeground = (cellIndex: number): string | undefined => {
    if (selected && isDimmed) return 'white';
    if (isDimmed) return undefined;
    if (selected) {
      if (isPriorityCell(cellIndex)) {
        const c = getPriorityCellColor();
        return c === 'white' ? 'black' : c;
      }
      return 'black';
    }
    if (isPriorityCell(cellIndex)) return getPriorityCellColor();
    return undefined;
  };

  const getStatusChipProps = (): {color: string; fg: string} => {
    if (selected && isDimmed) return {color: 'gray', fg: 'white'};
    if (selected && !isDimmed) {
      const hasBg = statusMeta.bg && statusMeta.bg !== 'none';
      return hasBg
        ? {color: statusMeta.bg, fg: statusMeta.fg}
        : {color: 'white', fg: statusMeta.fg === 'white' ? 'black' : statusMeta.fg};
    }
    return {color: statusMeta.bg, fg: statusMeta.fg};
  };

  const formatCellText = (text: string, width: number, justify: 'flex-start' | 'center' | 'flex-end'): string => {
    const raw = (text ?? '').trim();
    let visible = raw;
    if (stringDisplayWidth(visible) > width) {
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
    return visible + ' '.repeat(pad);
  };

  const renderProjectFeatureCell = (text: string, width: number, justify: 'flex-start' | 'center' | 'flex-end') => {
    const raw = (text ?? '').trim();
    let visible = raw;
    if (stringDisplayWidth(visible) > width) {
      visible = visible.slice(0, Math.max(0, width));
    }

    const bracketIndex = visible.indexOf('[');
    const left = bracketIndex >= 0 ? visible.slice(0, bracketIndex) : visible;
    const bracketed = bracketIndex >= 0 ? visible.slice(bracketIndex) : '';

    const contentWidth = stringDisplayWidth(visible);
    const pad = Math.max(0, width - contentWidth);

    // Avoid double-dimming the bracket when the whole row is already dimmed
    const renderBracket = (content: string) => <Text dimColor={!isDimmed || selected}>{content}</Text>;

    if (justify === 'flex-end') {
      return (
        <>
          {' '.repeat(pad)}
          <Text color={getCellForeground(COLUMNS.PROJECT_FEATURE)} dimColor={isDimmed && !selected}>{left}</Text>
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
          <Text color={getCellForeground(COLUMNS.PROJECT_FEATURE)} dimColor={isDimmed && !selected}>{left}</Text>
          {bracketed ? (selected && isDimmed
            ? <Text color={getCellForeground(COLUMNS.PROJECT_FEATURE)}>{bracketed}</Text>
            : renderBracket(bracketed))
          : null}
          {' '.repeat(rightPad)}
        </>
      );
    }
    // flex-start
    return (
      <>
        <Text color={getCellForeground(COLUMNS.PROJECT_FEATURE)} dimColor={isDimmed && !selected}>{left}</Text>
        {bracketed ? (selected && isDimmed
          ? <Text color={getCellForeground(COLUMNS.PROJECT_FEATURE)}>{bracketed}</Text>
          : renderBracket(bracketed))
        : null}
        {' '.repeat(pad)}
      </>
    );
  };

  return (
    <Box key={`worktree-${globalIndex}`} flexShrink={0}>
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
          wrap="truncate"
        >
          {formatCellText(cells[0].text, cells[0].width, cells[0].justify)}
        </Text>
      </Box>

      {/* Second column: STATUS */}
      <Box width={columnWidths.status} justifyContent="flex-start" marginRight={1}>
        {(() => { const s = getStatusChipProps(); return <StatusChip label={statusMeta.label || ''} color={s.color} fg={s.fg} width={columnWidths.status} />; })()}
      </Box>

      {cells.slice(1).map((cell, offsetIndex, arr) => {
        const cellIndex = offsetIndex + 1;
        const isLast = offsetIndex === arr.length - 1;
        let cellContent: React.ReactNode;
        if (cellIndex === COLUMNS.AI) {
          cellContent = renderSessionCell(cell.text, agentActive, cell.width, selected, isDimmed);
        } else if (cellIndex === COLUMNS.SHELL) {
          cellContent = renderSessionCell(cell.text, shellActive, cell.width, selected, isDimmed);
        } else if (cellIndex === COLUMNS.RUN) {
          cellContent = renderSessionCell(cell.text, runActive, cell.width, selected, isDimmed);
        } else {
          cellContent = (
            <Text
              backgroundColor={getCellBackground(cellIndex)}
              color={cellIndex === COLUMNS.PROJECT_FEATURE ? undefined : getCellForeground(cellIndex)}
              dimColor={isDimmed && !selected}
              bold={selected && !isPriorityCell(cellIndex)}
              wrap="truncate"
            >
              {cellIndex === COLUMNS.PROJECT_FEATURE
                ? renderProjectFeatureCell(cell.text, cell.width, cell.justify)
                : formatCellText(cell.text, cell.width, cell.justify)}
            </Text>
          );
        }
        return (
          <Box key={cellIndex} width={cell.width} justifyContent={cell.justify} marginRight={isLast ? 0 : 1}>
            {cellContent}
          </Box>
        );
      })}
    </Box>
  );
});

WorktreeRow.displayName = 'WorktreeRow';
