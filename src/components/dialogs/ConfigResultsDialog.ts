import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;

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
    return h(
      Box, {flexDirection: 'column', borderStyle: 'round', borderColor: 'red', padding: 1},
      h(Text, {color: 'red'}, 'Config Generation Failed'),
      h(Text, null, ''),
      h(Text, null, error || 'Unknown error occurred'),
      h(Text, null, ''),
      h(Text, {color: 'gray'}, 'Press any key to continue')
    );
  }

  // Truncate content if too long for display
  const maxLines = 15;
  const lines = content ? content.split('\n') : [];
  const truncated = lines.length > maxLines;
  const displayLines = truncated ? lines.slice(0, maxLines - 1) : lines;

  return h(
    Box, {flexDirection: 'column', borderStyle: 'round', borderColor: 'green', padding: 1},
    h(Text, {color: 'green'}, '✓ Config Generated Successfully'),
    h(Text, null, ''),
    h(Text, {color: 'cyan'}, `File: ${configPath}`),
    h(Text, null, ''),
    h(Text, {color: 'gray'}, 'Generated content:'),
    h(Box, {borderStyle: 'single', borderColor: 'gray', padding: 1, flexDirection: 'column'},
      ...displayLines.map((line, i) => 
        h(Text, {key: i, color: line.trim().startsWith('//') ? 'gray' : undefined}, line)
      ),
      truncated ? h(Text, {color: 'yellow'}, '... (content truncated)') : null
    ),
    h(Text, null, ''),
    h(Text, {color: 'gray'}, 'Press any key to continue')
  );
}