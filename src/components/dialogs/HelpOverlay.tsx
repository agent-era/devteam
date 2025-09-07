import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import AnnotatedText from '../common/AnnotatedText.js';
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
      <Text color="magenta" wrap="truncate">Help</Text>
      {helpSections.map((line, i) => (
        <AnnotatedText key={i} color={line.trim() ? 'magenta' : undefined} wrap="truncate" text={line} />
      ))}
    </Box>
  );
}
