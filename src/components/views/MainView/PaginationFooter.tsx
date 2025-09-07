import React, {memo} from 'react';
import {Box, Text} from 'ink';
import {useTerminalDimensions} from '../../../hooks/useTerminalDimensions.js';

interface PaginationFooterProps {
  totalPages: number;
  paginationText: string;
}

export const PaginationFooter = memo<PaginationFooterProps>(({ 
  totalPages,
  paginationText
}) => {
  const {rows} = useTerminalDimensions();
  // On very small terminals, hide footer to preserve space
  if (rows <= 8) return null;

  return (
    <Box marginTop={1}>
      <Text color="gray" wrap="truncate">{paginationText.trimStart()}</Text>
    </Box>
  );
});

PaginationFooter.displayName = 'PaginationFooter';
