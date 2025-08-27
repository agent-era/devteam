import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;

type Props = {
  project: string;
  configPath: string;
  claudePrompt: string;
  onCancel: () => void;
  onCreateConfig: () => void;
};

export default function RunConfigDialog({project, configPath, claudePrompt, onCancel, onCreateConfig}: Props) {
  const {isRawModeSupported} = useStdin();
  
  useInput((input, key) => {
    if (!isRawModeSupported) return;
    if (key.escape || input === 'q') onCancel();
    else if (input === 'y' || input === 'Y' || key.return) onCreateConfig();
    else if (input === 'n' || input === 'N') onCancel();
  });

  // Split the prompt into lines for better display
  const promptLines = claudePrompt.split('\n');
  const maxLines = 10; // Limit displayed lines
  const truncated = promptLines.length > maxLines;
  const displayLines = truncated ? promptLines.slice(0, maxLines - 1) : promptLines;

  return h(
    Box, {flexDirection: 'column', borderStyle: 'round', borderColor: 'blue', padding: 1},
    h(Text, {color: 'cyan'}, 'Run Session Not Configured'),
    h(Text, null, ''),
    h(Text, null, `No run configuration found for project: ${project}`),
    h(Text, null, `Expected location: ${configPath}`),
    h(Text, null, ''),
    h(Text, null, 'Would you like to create and configure it with Claude\'s help?'),
    h(Text, null, ''),
    h(Text, {color: 'yellow'}, 'Claude will be asked to:'),
    h(Box, {borderStyle: 'single', borderColor: 'gray', padding: 1, flexDirection: 'column'},
      ...displayLines.map((line, i) => 
        h(Text, {key: i, color: 'gray'}, line || ' ')
      ),
      truncated ? h(Text, {color: 'yellow'}, '... (prompt truncated)') : null
    ),
    h(Text, null, ''),
    h(Box, {justifyContent: 'space-around'},
      h(Text, {color: 'green'}, '[Y]es'),
      h(Text, {color: 'red'}, '[N]o'),
      h(Text, {color: 'gray'}, '[ESC] Cancel')
    )
  );
}