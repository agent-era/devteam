import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import {generateHelpSections} from '../../constants.js';
import {getProjectsDirectory} from '../../config.js';

type Props = { onClose: () => void };

export default function HelpOverlay({onClose}: Props) {
  useInput((input, key) => {
    if (key.escape || input === '?' || input === 'q' || key.return) onClose();
  });
  
  const helpSections = generateHelpSections(getProjectsDirectory());
  
  return (
    <Box flexDirection="column">
      <Text color="cyan">Help</Text>
      {helpSections.map((line, i) => 
        <Text key={i} color={line.endsWith(':') ? 'magenta' : undefined}>
          {line}
        </Text>
      )}
    </Box>
  );
}

