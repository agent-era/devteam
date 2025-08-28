import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;

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
  return h(
    Box, {flexDirection: 'column'},
    title ? h(Text, {color: 'cyan'}, title) : null,
    h(Text, null, message),
    h(Text, {color: 'gray'}, `Press ${confirmKey} to confirm, ${cancelKey} to cancel`)
  );
}

