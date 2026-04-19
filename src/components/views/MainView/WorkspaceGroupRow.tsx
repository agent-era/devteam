import React, {memo} from 'react';
import {Box, Text} from 'ink';
import type {WorktreeInfo} from '../../../models.js';
import type {ColumnWidths} from './hooks/useColumnWidths.js';
import {stringDisplayWidth} from '../../../shared/utils/formatting.js';
import StatusChip from '../../common/StatusChip.js';
import {getStatusMeta} from './highlight.js';
import {renderSessionCell} from './SessionCell.js';

interface WorkspaceGroupRowProps {
  workspace: WorktreeInfo; // header item with is_workspace_header
  index: number;
  globalIndex: number;
  selected: boolean;
  columnWidths: ColumnWidths;
}

export const WorkspaceGroupRow = memo<WorkspaceGroupRowProps>(({workspace, globalIndex, selected, columnWidths}) => {
  const numberText = String(globalIndex + 1);
  const headerText = `${workspace.feature} [workspace]`;
  const truncatedHeader = stringDisplayWidth(headerText) > columnWidths.projectFeature
    ? headerText.slice(0, Math.max(0, columnWidths.projectFeature - 3)) + '...'
    : headerText;

  const agentActive = workspace.session?.attached || false;
  const shellActive = workspace.session?.shell_attached || false;
  const runActive = workspace.session?.run_attached || false;

  const cells = [
    {text: 'a', width: columnWidths.ai, justify: 'center' as const},
    {text: 's', width: columnWidths.shell, justify: 'center' as const},
    {text: 'x', width: columnWidths.run, justify: 'center' as const},
    {text: truncatedHeader, width: columnWidths.projectFeature, justify: 'flex-start' as const},
    {text: '', width: columnWidths.diff, justify: 'flex-end' as const},
    {text: '', width: columnWidths.changes, justify: 'flex-end' as const},
    {text: '', width: columnWidths.pr, justify: 'flex-end' as const},
  ];

  const {label: statusLabel, bg: statusBg, fg: statusFg} = getStatusMeta(workspace, undefined);

  const formatCellText = (text: string, width: number, justify: 'flex-start' | 'center' | 'flex-end'): string => {
    const raw = (text ?? '').trim();
    let visible = raw;
    if (stringDisplayWidth(visible) > width) {
      visible = visible.slice(0, Math.max(0, width));
    }
    const pad = Math.max(0, width - stringDisplayWidth(visible));
    if (justify === 'flex-end') return ' '.repeat(pad) + visible;
    if (justify === 'center') {
      const left = Math.floor(pad / 2); const right = pad - left;
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
    if (justify === 'flex-end') {
      return (
        <>
          {' '.repeat(pad)}
          <Text>{left}</Text>
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
          <Text>{left}</Text>
          {bracketed ? <Text dimColor>{bracketed}</Text> : null}
          {' '.repeat(rightPad)}
        </>
      );
    }
    return (
      <>
        <Text>{left}</Text>
        {bracketed ? <Text dimColor>{bracketed}</Text> : null}
        {' '.repeat(pad)}
      </>
    );
  };

  const hasBg = statusBg && statusBg !== 'none';
  const chipColor = selected ? (hasBg ? statusBg : 'white') : statusBg;
  const chipFg = selected ? (hasBg ? statusFg : (statusFg === 'white' ? 'black' : statusFg)) : statusFg;

  return (
    <Box>
      <Box width={columnWidths.number} justifyContent="flex-start" marginRight={1}>
        <Text bold={selected} backgroundColor={selected ? 'white' : undefined} color={selected ? 'black' : undefined}>{formatCellText(numberText, columnWidths.number, 'flex-start')}</Text>
      </Box>
      <Box width={columnWidths.status} justifyContent="flex-start" marginRight={1}>
        <StatusChip label={statusLabel} color={chipColor} fg={chipFg} width={columnWidths.status} />
      </Box>
      {cells.map((cell, idx) => {
        let cellContent: React.ReactNode;
        if (idx === 0) {
          cellContent = renderSessionCell(cell.text, agentActive, cell.width, selected);
        } else if (idx === 1) {
          cellContent = renderSessionCell(cell.text, shellActive, cell.width, selected);
        } else if (idx === 2) {
          cellContent = renderSessionCell(cell.text, runActive, cell.width, selected);
        } else {
          cellContent = (
            <Text bold={selected} backgroundColor={selected ? 'white' : undefined} color={selected ? 'black' : undefined}>
              {idx === 3
                ? renderProjectFeatureCell(cell.text, cell.width, cell.justify)
                : formatCellText(cell.text, cell.width, cell.justify)}
            </Text>
          );
        }
        return (
          <Box key={idx} width={cell.width} justifyContent={cell.justify} marginRight={idx < cells.length - 1 ? 1 : 0}>
            {cellContent}
          </Box>
        );
      })}
    </Box>
  );
}, (prev, next) => {
  const prevW = prev.workspace;
  const nextW = next.workspace;
  const widthsEqual = prev.columnWidths.number === next.columnWidths.number &&
    prev.columnWidths.status === next.columnWidths.status &&
    prev.columnWidths.projectFeature === next.columnWidths.projectFeature &&
    prev.columnWidths.ai === next.columnWidths.ai &&
    prev.columnWidths.shell === next.columnWidths.shell &&
    prev.columnWidths.run === next.columnWidths.run &&
    prev.columnWidths.diff === next.columnWidths.diff &&
    prev.columnWidths.changes === next.columnWidths.changes &&
    prev.columnWidths.pr === next.columnWidths.pr;

  return (
    prev.selected === next.selected &&
    prev.globalIndex === next.globalIndex &&
    widthsEqual &&
    prevW.feature === nextW.feature &&
    !!prevW.session?.attached === !!nextW.session?.attached &&
    (prevW.session?.ai_status || 'not_running') === (nextW.session?.ai_status || 'not_running') &&
    !!prevW.session?.shell_attached === !!nextW.session?.shell_attached &&
    !!prevW.session?.run_attached === !!nextW.session?.run_attached
  );
});

WorkspaceGroupRow.displayName = 'WorkspaceGroupRow';
