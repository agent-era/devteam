import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

type Props = {
  onInstall: () => void;
  onSkip: () => void;
  onNever: () => void;
};

const OPTIONS: Array<{label: string; key: keyof Props}> = [
  {label: 'Install', key: 'onInstall'},
  {label: 'Skip', key: 'onSkip'},
  {label: 'Never ask again', key: 'onNever'},
];

export default function InstallHooksDialog({onInstall, onSkip, onNever}: Props) {
  const [selected, setSelected] = useState(0);
  const callbacks = {onInstall, onSkip, onNever};

  useInput((input, key) => {
    if (key.leftArrow || input === 'h') setSelected((s) => Math.max(0, s - 1));
    if (key.rightArrow || input === 'l') setSelected((s) => Math.min(OPTIONS.length - 1, s + 1));
    if (key.return) callbacks[OPTIONS[selected].key]();
    if (key.escape) onSkip();
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      width={70}
      alignSelf="center"
      gap={1}
    >
      <Text bold color="cyan">Install AI hooks</Text>
      <Text>
        Hook-based status detection gives instant, accurate working/waiting/idle
        state for Claude Code, Gemini CLI, and Codex — without reading the terminal.
      </Text>
      <Box flexDirection="column">
        <Text>This installs hooks in:</Text>
        <Text color="gray">  ~/.claude/settings.json</Text>
        <Text color="gray">  ~/.gemini/settings.json</Text>
        <Text color="gray">  ~/.codex/hooks.json</Text>
      </Box>
      <Box gap={2}>
        {OPTIONS.map(({label}, i) => (
          <Box key={label} paddingX={1} borderStyle={selected === i ? 'round' : undefined} borderColor="cyan">
            <Text bold={selected === i} color={selected === i ? 'cyan' : undefined}>
              {label}
            </Text>
          </Box>
        ))}
      </Box>
      <Text color="gray">[←/→] navigate  [enter] confirm  [esc] skip</Text>
    </Box>
  );
}
