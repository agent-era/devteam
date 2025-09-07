import React, {memo} from 'react';
import {Box, Text} from 'ink';
import type {ColumnWidths} from './hooks/useColumnWidths.js';

interface TableHeaderProps {
  columnWidths: ColumnWidths;
}

export const TableHeader = memo<TableHeaderProps>(({columnWidths}) => {
  const headers = [
    {text: '#', width: columnWidths.number, justify: 'flex-start' as const},
    {text: 'PROJECT/FEATURE', width: columnWidths.projectFeature, justify: 'flex-start' as const},
    {text: 'AI', width: columnWidths.ai, justify: 'center' as const},
    {text: 'DIFF', width: columnWidths.diff, justify: 'flex-end' as const},
    {text: 'CHANGES', width: columnWidths.changes, justify: 'flex-end' as const},
    {text: 'PUSHED', width: columnWidths.pushed, justify: 'center' as const},
    {text: 'PR', width: columnWidths.pr, justify: 'flex-start' as const},
  ];

  return (
    <Box marginBottom={0}>
      {headers.map((header, index) => (
        <Box
          key={index}
          width={header.width}
          justifyContent={header.justify}
          marginRight={index < headers.length - 1 ? 1 : 0}
        >
          <Text color="magenta" bold wrap="truncate">
            {header.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
});

TableHeader.displayName = 'TableHeader';
