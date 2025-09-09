import React from 'react';
import {Box, Text, useInput} from 'ink';

type Props = {
  onExit: () => void;
};

export default function TmuxMissingDialog({onExit}: Props) {
  const isMac = process.platform === 'darwin';

  useInput((input, key) => {
    if (key.return || key.escape || input === 'q' || input === 'Q') onExit();
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="red"
      padding={1}
      width={80}
      alignSelf="center"
    >
      <Text bold color="red">tmux is required</Text>
      <Box marginTop={1} />
      <Text>DevTeam relies on tmux to manage development sessions.</Text>
      <Box marginTop={1} />
      {isMac ? (
        <>
          <Text>Install tmux on macOS using Homebrew:</Text>
          <Text>
            <Text bold color="cyan">brew install tmux</Text>
          </Text>
          <Text dimColor>Ensure Homebrew bin is on PATH (e.g., /opt/homebrew/bin).</Text>
        </>
      ) : (
        <>
          <Text>Install tmux using your package manager (e.g., apt, yum, pacman).</Text>
          <Text dimColor>Example: sudo apt-get install tmux</Text>
        </>
      )}
      <Box marginTop={1} />
      <Text color="magenta">Press [enter] or [q] to exit</Text>
    </Box>
  );
}

