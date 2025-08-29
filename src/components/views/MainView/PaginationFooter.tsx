import React, {memo} from 'react';
import {Box, Text} from 'ink';

interface PaginationFooterProps {
  totalPages: number;
  paginationText: string;
}

export const PaginationFooter = memo<PaginationFooterProps>(({
  totalPages,
  paginationText
}) => {
  if (totalPages <= 1) return null;

  return (
    <Box marginTop={1}>
      <Text color="gray">{paginationText}</Text>
    </Box>
  );
});

PaginationFooter.displayName = 'PaginationFooter';