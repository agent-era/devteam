import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';

type Props = {
  title?: string;
  message: string;
  confirmKey?: string; // default 'y'
  cancelKey?: string; // default 'n'
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({title, message, confirmKey = 'y', cancelKey = 'n', onConfirm, onCancel}: Props) {
  useInput((input, key) => {
    if (key.escape || input === cancelKey) onCancel();
    if (key.return || input === confirmKey) onConfirm();
  });
  return (
    <Box flexDirection="column">
      {title ? <Text color="cyan">{title}</Text> : null}
      <Text>{message}</Text>
      <Text color="gray">Press {confirmKey} to confirm, {cancelKey} to cancel</Text>
    </Box>
  );
}

