import React, {memo} from 'react';
import {Box, Text} from 'ink';
import type {WorktreeInfo} from '../../../models.js';
import type {ColumnWidths} from './hooks/useColumnWidths.js';
import {stringDisplayWidth} from '../../../shared/utils/formatting.js';
import {getAISymbol} from './utils.js';

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
  const headerText = `workspace/${workspace.feature}`;
  const truncatedHeader = stringDisplayWidth(headerText) > columnWidths.projectFeature
    ? headerText.slice(0, Math.max(0, columnWidths.projectFeature - 3)) + '...'
    : headerText;

  const cells = [
    {text: numberText, width: columnWidths.number, justify: 'flex-start' as const},
    {text: truncatedHeader, width: columnWidths.projectFeature, justify: 'flex-start' as const},
    {text: ai, width: columnWidths.ai, justify: 'center' as const},
    {text: '', width: columnWidths.diff, justify: 'flex-end' as const},
    {text: '', width: columnWidths.changes, justify: 'flex-end' as const},
    {text: '', width: columnWidths.pushed, justify: 'center' as const},
    {text: '', width: columnWidths.pr, justify: 'flex-start' as const},
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

  return (
    <Box>
      {cells.map((cell, idx) => (
        <Box key={idx} width={cell.width} justifyContent={cell.justify} marginRight={idx < cells.length - 1 ? 1 : 0}>
          <Text bold={selected} inverse={selected}>
            {formatCellText(cell.text, cell.width, cell.justify)}
          </Text>
        </Box>
      ))}
    </Box>
  );
});

WorkspaceGroupRow.displayName = 'WorkspaceGroupRow';

