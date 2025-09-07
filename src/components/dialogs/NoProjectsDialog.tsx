import React from 'react';
import {Box, Text, useInput} from 'ink';
import {getProjectsDirectory} from '../../config.js';

type Props = {
  onExit: () => void;
};

export default function NoProjectsDialog({onExit}: Props) {
  const projectsDir = getProjectsDirectory();

  useInput((input, key) => {
    if (key.return || key.escape || input === 'q' || input === 'Q') onExit();
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
      width={80}
      alignSelf="center"
    >
      <Text bold color="yellow">No projects found</Text>
      <Box marginTop={1} />
      <Text>
        This directory has no project folders with a <Text bold>.git</Text> repo.
      </Text>
      <Text>
        Current projects directory: <Text color="cyan">{projectsDir}</Text>
      </Text>
      <Box marginTop={1} />
      <Text>
        Tips:
      </Text>
      <Text> - Place each project as a subdirectory containing a .git folder</Text>
      <Text> - Or run with PROJECTS_DIR=/path/to/projects devteam</Text>
      <Text> - Or run with --dir /path/to/projects</Text>
      <Box marginTop={1} />
      <Text color="magenta">Press [enter] or [q] to exit</Text>
    </Box>
  );
}

