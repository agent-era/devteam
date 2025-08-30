import React, {memo} from 'react';
import {Box, Text} from 'ink';
import {getProjectsDirectory} from '../../../config.js';

export const EmptyState = memo(() => {
  const projectsDir = getProjectsDirectory();
  
  return (
    <Box flexDirection="column">
      <Text color="yellow">No worktrees found.</Text>
      <Text>Ensure your projects live under {projectsDir} and have worktrees in -branches folders.</Text>
      <Text>Press q to quit.</Text>
    </Box>
  );
});

EmptyState.displayName = 'EmptyState';