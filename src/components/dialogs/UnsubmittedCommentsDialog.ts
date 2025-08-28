import React from 'react';
import {Box, Text, useInput} from 'ink';
const h = React.createElement;

type Props = {
  commentCount: number;
  onSubmit: () => void;
  onExitWithoutSubmitting: () => void;
  onCancel: () => void;
};

export default function UnsubmittedCommentsDialog({commentCount, onSubmit, onExitWithoutSubmitting, onCancel}: Props) {
  useInput((input, key) => {
    if (key.escape) onCancel();
    if (input === 'S' || input === 's') onSubmit();
    if (input === 'q' || input === 'Q') onExitWithoutSubmitting();
  });

  return h(
    Box,
    {flexDirection: 'column', borderStyle: 'double', borderColor: 'yellow', padding: 1},
    h(Text, {color: 'yellow', bold: true}, '⚠️  Unsaved Comments'),
    h(Text, null, `You have ${commentCount} unsaved comment${commentCount === 1 ? '' : 's'}.`),
    h(Text, null, ''),
    h(Text, null, 'What would you like to do?'),
    h(Text, null, ''),
    h(Text, {color: 'green'}, 'S - Submit comments to Claude'),
    h(Text, {color: 'blue'}, 'q - Exit without submitting (comments will be kept)'),
    h(Text, {color: 'gray'}, 'ESC - Cancel (return to diff view)')
  );
}