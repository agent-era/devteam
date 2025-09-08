import React, {memo} from 'react';
import {Box, Text} from 'ink';

interface EmptyStateProps {
  hasProjects?: boolean;
}

export const EmptyState = memo(({hasProjects = false}: EmptyStateProps) => {

  if (hasProjects) {
    return (
      <Box flexDirection="column" flexGrow={1} alignItems="center" justifyContent="center">
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          padding={1}
          width={80}
          alignSelf="center"
        >
          <Text bold color="cyan">Welcome to DevTeam</Text>
          <Box marginTop={1} />
          <Text>
            Press <Text bold>[n]</Text> to create a new branch (we'll set up a git worktree for it).
          </Text>
          <Box marginTop={1} />
          <Text color="magenta">Press [q] to quit</Text>
        </Box>
      </Box>
    );
  }

  // No projects case is handled by NoProjectsDialog at the App level.
  // Render nothing here to avoid redundant messaging.
  return null;
});

EmptyState.displayName = 'EmptyState';
