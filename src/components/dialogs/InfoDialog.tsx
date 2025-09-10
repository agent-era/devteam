import React from 'react';
import {Box, Text, useInput} from 'ink';

type Props = {
  title?: string;
  message: string;
  onClose: () => void;
  confirmLabel?: string;
};

export default function InfoDialog({title, message, onClose, confirmLabel = 'OK'}: Props) {
  useInput((input, key) => {
    if (key.return || key.escape || input === 'q' || input === 'Q') onClose();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1} width={80} alignSelf="center">
      {title ? <Text color="cyan">{title}</Text> : null}
      <Box marginTop={title ? 1 : 0} />
      <Text>{message}</Text>
      <Box marginTop={1} />
      <Text color="magenta">Press [enter] to continue</Text>
    </Box>
  );
}

