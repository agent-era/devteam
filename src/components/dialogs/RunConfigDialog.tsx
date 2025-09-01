import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';

type Props = {
  project: string;
  configPath: string;
  claudePrompt: string;
  onCancel: () => void;
  onCreateConfig: () => void;
};

export default function RunConfigDialog({project, configPath, claudePrompt, onCancel, onCreateConfig}: Props) {
  useInput((input, key) => {
    if (key.escape || input === 'q') onCancel();
    else if (input === 'y' || input === 'Y' || key.return) onCreateConfig();
    else if (input === 'n' || input === 'N') onCancel();
  });

  // Split the prompt into lines for better display
  const promptLines = claudePrompt.split('\n');
  const maxLines = 10; // Limit displayed lines
  const truncated = promptLines.length > maxLines;
  const displayLines = truncated ? promptLines.slice(0, maxLines - 1) : promptLines;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
      <Text color="cyan">Run Session Not Configured</Text>
      <Text></Text>
      <Text>No run configuration found for project: {project}</Text>
      <Text>Expected location: {configPath}</Text>
      <Text></Text>
      <Text>Would you like to create and configure it with Claude's help?</Text>
      <Text></Text>
      <Text color="yellow">Claude will be asked to:</Text>
      <Box borderStyle="single" borderColor="gray" padding={1} flexDirection="column">
        {displayLines.map((line, i) => 
          <Text key={i} color="gray">{line || ' '}</Text>
        )}
        {truncated ? <Text color="yellow">... (prompt truncated)</Text> : null}
      </Box>
      <Text></Text>
      <Box justifyContent="space-around">
        <Text color="green">[Y]es</Text>
        <Text color="red">[N]o</Text>
        <Text color="gray">[ESC] Cancel</Text>
      </Box>
    </Box>
  );
}