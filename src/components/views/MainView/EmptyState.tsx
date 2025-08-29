import React, {memo} from 'react';
import {Box, Text} from 'ink';

export const EmptyState = memo(() => {
  return (
    <Box flexDirection="column">
      <Text color="yellow">No worktrees found.</Text>
      <Text>Ensure your projects live under ~/projects and have worktrees in -branches folders.</Text>
      <Text>Press q to quit.</Text>
    </Box>
  );
});

EmptyState.displayName = 'EmptyState';