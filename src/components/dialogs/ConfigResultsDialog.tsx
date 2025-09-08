import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';

type Props = {
  success: boolean;
  content?: string;
  configPath: string;
  error?: string;
  onClose: () => void;
};

export default function ConfigResultsDialog({success, content, configPath, error, onClose}: Props) {
  useInput((input, key) => {
    // Any key closes the dialog
    onClose();
  });

  if (!success) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="red" padding={1}>
        <Text color="red">Config Generation Failed</Text>
        <Text></Text>
        <Text>{error || 'Unknown error occurred'}</Text>
        <Text></Text>
        <Text color="magenta" wrap="truncate">Press any key to continue</Text>
      </Box>
    );
  }

  // Truncate content if too long for display
  const maxLines = 15;
  const lines = content ? content.split('\n') : [];
  const truncated = lines.length > maxLines;
  const displayLines = truncated ? lines.slice(0, maxLines - 1) : lines;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1}>
      <Text color="green">Config Generated Successfully</Text>
      <Text></Text>
      <Text color="cyan">File: {configPath}</Text>
      <Text></Text>
      <Text color="gray">Generated content:</Text>
      <Box borderStyle="single" borderColor="gray" padding={1} flexDirection="column">
        {displayLines.map((line, i) => 
          <Text key={i} color={line.trim().startsWith('//') ? 'gray' : undefined}>
            {line}
          </Text>
        )}
        {truncated ? <Text color="yellow">... (content truncated)</Text> : null}
      </Box>
      <Text></Text>
      <Text color="magenta" wrap="truncate">Press any key to continue</Text>
    </Box>
  );
}
