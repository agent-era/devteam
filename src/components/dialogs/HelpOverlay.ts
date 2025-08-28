import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import {HELP_SECTIONS} from '../../constants.js';
const h = React.createElement;

type Props = { onClose: () => void };

export default function HelpOverlay({onClose}: Props) {
  useInput((input, key) => {
    if (key.escape || input === '?' || input === 'q' || key.return) onClose();
  });
  return h(
    Box, {flexDirection: 'column'},
    h(Text, {color: 'cyan'}, 'Help'),
    ...HELP_SECTIONS.map((line, i) => h(Text, {key: i, color: line.endsWith(':') ? 'magenta' : undefined}, line))
  );
}

