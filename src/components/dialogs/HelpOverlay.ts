import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import {generateHelpSections} from '../../constants.js';
import {getProjectsDirectory} from '../../config.js';
const h = React.createElement;

type Props = { onClose: () => void };

export default function HelpOverlay({onClose}: Props) {
  useInput((input, key) => {
    if (key.escape || input === '?' || input === 'q' || key.return) onClose();
  });
  
  const helpSections = generateHelpSections(getProjectsDirectory());
  
  return h(
    Box, {flexDirection: 'column'},
    h(Text, {color: 'cyan'}, 'Help'),
    ...helpSections.map((line, i) => h(Text, {key: i, color: line.endsWith(':') ? 'magenta' : undefined}, line))
  );
}

