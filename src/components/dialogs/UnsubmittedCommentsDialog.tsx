import React from 'react';
import {Box, Text, useInput} from 'ink';
import AnnotatedText from '../common/AnnotatedText.js';

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
      <Box marginTop={1} />
      <AnnotatedText color="green" text={'[S]ubmit comments to agent'} />
      <AnnotatedText color="blue" text={'[q] exit without submitting (comments will be kept)'} />
      <AnnotatedText color="magenta" wrap="truncate" text={'[esc] cancel (return to diff view)'} />
    </Box>
  );
}
