import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import AnnotatedText from '../common/AnnotatedText.js';

type Props = {
  sessionName: string;
  onGoToSession: () => void;
  onCancel: () => void;
};

export default function SessionWaitingDialog({sessionName, onGoToSession, onCancel}: Props) {
  const {isRawModeSupported} = useStdin();
  
  useInput((input, key) => {
    if (!isRawModeSupported) return;
    
    if (key.escape || input === 'c' || input === 'C') {
      onCancel();
    } else if (key.return || input === 'g' || input === 'G') {
      onGoToSession();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
      width={80}
      alignSelf="center"
    >
      <Text bold color="yellow">⚠ Claude is Waiting for Response</Text>
      <Box marginTop={1} marginBottom={1} />
      <Text>Claude in session "{sessionName}" is waiting for a response to a question</Text>
      <Text>and cannot accept new input right now.</Text>
      <Box marginTop={1} marginBottom={1} />
      <Text bold>Options:</Text>
      <Text>• Go to session to respond to Claude's question</Text>
      <Text>• Cancel and try again later when Claude is idle</Text>
      <Box marginTop={1} marginBottom={1} />
      <AnnotatedText color="magenta" wrap="truncate" text={'[g]o to session  •  [c]ancel  •  [esc] cancel'} />
    </Box>
  );
}
