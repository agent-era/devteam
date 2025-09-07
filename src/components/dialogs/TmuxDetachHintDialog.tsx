import React from 'react';
import {Box, Text, useInput} from 'ink';

type Props = {
  onContinue: () => void;
};

export default function TmuxDetachHintDialog({onContinue}: Props) {
  useInput((input, key) => {
    if (key.return || key.escape || !!input) {
      onContinue();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      width={80}
      alignSelf="center"
    >
      <Text bold color="cyan">devteam uses tmux to manage sessions</Text>
      <Box marginTop={1} />
      <Text>When you attach to a session, you are inside tmux.</Text>
      <Text>
        To detach and return here: <Text bold>Ctrl+b</Text>, then release Ctrl, then press <Text bold>d</Text>.
      </Text>
      <Box marginTop={1} />
      <Text color="magenta">Press Enter to continue and attach</Text>
    </Box>
  );
}

