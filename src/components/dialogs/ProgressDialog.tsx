import React from 'react';
import {Box, Text} from 'ink';

type Props = {
  title?: string;
  message: string;
  project?: string;
};

export default function ProgressDialog({title = 'Progress', message, project}: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
      <Text color="cyan">{title}</Text>
      <Text></Text>
      <Text>{message}</Text>
      {project ? <Text color="gray">Project: {project}</Text> : null}
      <Text></Text>
      <Text color="yellow">⏳ Please wait...</Text>
    </Box>
  );
}