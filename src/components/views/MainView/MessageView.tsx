import React, {memo} from 'react';
import {Box, Text} from 'ink';

interface MessageViewProps {
  message?: string;
}

export const MessageView = memo<MessageViewProps>(({message}) => {
  return (
    <Box flexDirection="column">
      <Text color="yellow">{message || ''}</Text>
    </Box>
  );
});

MessageView.displayName = 'MessageView';