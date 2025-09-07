import React, {memo} from 'react';
import {Box, Text} from 'ink';

type Prompt = {title?: string; text?: string; hint?: string};

interface PromptViewProps {
  prompt?: Prompt;
}

export const PromptView = memo<PromptViewProps>(({prompt}) => {
  return (
    <Box flexDirection="column">
      <Text color="cyan">{prompt?.title || ''}</Text>
      <Text>{prompt?.text || ''}</Text>
      <Text color="magenta">{prompt?.hint || ''}</Text>
    </Box>
  );
});

PromptView.displayName = 'PromptView';
