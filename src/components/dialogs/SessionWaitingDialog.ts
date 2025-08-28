import React from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;

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

  return h(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'yellow',
      padding: 1,
      width: 80,
      alignSelf: 'center'
    },
    h(Text, {bold: true, color: 'yellow'}, '⚠ Claude is Waiting for Response'),
    h(Box, {marginTop: 1, marginBottom: 1}),
    h(Text, null, `Claude in session "${sessionName}" is waiting for a response to a question`),
    h(Text, null, 'and cannot accept new input right now.'),
    h(Box, {marginTop: 1, marginBottom: 1}),
    h(Text, {bold: true}, 'Options:'),
    h(Text, null, '• Go to session to respond to Claude\'s question'),
    h(Text, null, '• Cancel and try again later when Claude is idle'),
    h(Box, {marginTop: 1, marginBottom: 1}),
    h(Text, {color: 'gray'}, 'Press G to Go to Session  •  Press C or Esc to Cancel')
  );
}