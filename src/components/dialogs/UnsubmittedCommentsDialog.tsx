import React from 'react';
import {Box, Text, useInput} from 'ink';

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

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="yellow" padding={1}>
      <Text color="yellow" bold>⚠️  Unsaved Comments</Text>
      <Text>You have {commentCount} unsaved comment{commentCount === 1 ? '' : 's'}.</Text>
      <Text></Text>
      <Text>What would you like to do?</Text>
      <Text></Text>
      <Text color="green">S - Submit comments to Claude</Text>
      <Text color="blue">q - Exit without submitting (comments will be kept)</Text>
      <Text color="gray">ESC - Cancel (return to diff view)</Text>
    </Box>
  );
}