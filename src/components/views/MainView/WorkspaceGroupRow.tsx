import React, {memo} from 'react';
import {Box, Text} from 'ink';
import type {WorktreeInfo} from '../../../models.js';
import type {ColumnWidths} from './hooks/useColumnWidths.js';
import {stringDisplayWidth} from '../../../shared/utils/formatting.js';
import {getAISymbol} from './utils.js';
import StatusChip from '../../common/StatusChip.js';

interface WorkspaceGroupRowProps {
  workspace: WorktreeInfo; // header item with is_workspace_header
  index: number;
  globalIndex: number;
  selected: boolean;
  columnWidths: ColumnWidths;
}

export const WorkspaceGroupRow = memo<WorkspaceGroupRowProps>(({workspace, globalIndex, selected, columnWidths}) => {
  const numberText = String(globalIndex + 1);
  const ai = getAISymbol(workspace.session?.ai_status || '', workspace.session?.attached || false);
  // Render like simple rows: feature [workspace]
  const headerText = `${workspace.feature} [workspace]`;
  const truncatedHeader = stringDisplayWidth(headerText) > columnWidths.projectFeature
    ? headerText.slice(0, Math.max(0, columnWidths.projectFeature - 3)) + '...'
    : headerText;

  const cells = [
    {text: truncatedHeader, width: columnWidths.projectFeature, justify: 'flex-start' as const},
    {text: ai, width: columnWidths.ai, justify: 'center' as const},
    {text: '', width: columnWidths.diff, justify: 'flex-end' as const},
    {text: '', width: columnWidths.changes, justify: 'flex-end' as const},
    {text: '', width: columnWidths.pr, justify: 'flex-end' as const},
  ];

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

  // Custom render for the project/feature cell to dim bracketed [workspace]
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

  return (
    <Box>
      {/* First column: # */}
      <Box width={columnWidths.number} justifyContent="flex-start" marginRight={1}>
        <Text bold={selected} inverse={selected}>{formatCellText(numberText, columnWidths.number, 'flex-start')}</Text>
      </Box>
      {/* Second column: STATUS (blank for workspace rows) */}
      <Box width={columnWidths.status} justifyContent="flex-start" marginRight={1}>
        <StatusChip label={''} color={'black'} fg={'white'} width={columnWidths.status} />
      </Box>
      {/* Remaining columns: PROJECT/FEATURE, AI, DIFF, CHANGES, PR */}
      {cells.map((cell, idx) => (
        <Box key={idx} width={cell.width} justifyContent={cell.justify} marginRight={idx < cells.length - 1 ? 1 : 0}>
          <Text bold={selected} inverse={selected}>
            {idx === 0
              ? renderProjectFeatureCell(cell.text, cell.width, cell.justify)
              : formatCellText(cell.text, cell.width, cell.justify)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}, (prev, next) => {
  // Custom comparison to minimize re-renders
  const prevW = prev.workspace;
  const nextW = next.workspace;
  const widthsEqual = prev.columnWidths.number === next.columnWidths.number &&
    prev.columnWidths.status === next.columnWidths.status &&
    prev.columnWidths.projectFeature === next.columnWidths.projectFeature &&
    prev.columnWidths.ai === next.columnWidths.ai &&
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
    (prevW.session?.ai_tool || 'none') === (nextW.session?.ai_tool || 'none')
  );
});

WorkspaceGroupRow.displayName = 'WorkspaceGroupRow';
