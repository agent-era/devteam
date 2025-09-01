import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {useTextInput} from './TextInput.js';
import {useInputFocus} from '../../contexts/InputFocusContext.js';

type Props = {
  fileName: string;
  lineText: string;
  initialComment?: string;
  onSave: (comment: string) => void;
  onCancel: () => void;
};

const CommentInputDialog = React.memo(function CommentInputDialog({fileName, lineText, initialComment = '', onSave, onCancel}: Props) {
  const commentInput = useTextInput(initialComment);
  const {requestFocus, releaseFocus} = useInputFocus();

  // Request focus when dialog mounts
  useEffect(() => {
    requestFocus('comment-input-dialog');
    return () => {
      releaseFocus('comment-input-dialog');
    };
  }, [requestFocus, releaseFocus]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return && !key.shift) {
      if (commentInput.value.trim()) {
        onSave(commentInput.value.trim());
      } else {
        onCancel();
      }
      return;
    }

    if (key.return && key.shift) {
      // Handle newlines for multi-line comments
      commentInput.handleKeyInput('\n', {});
      return;
    }

    // Let the text input hook handle all other input
    commentInput.handleKeyInput(input, key);
  });

  const lines = commentInput.value.split('\n');
  const boxWidth = 70; // Fixed width for consistent appearance

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      padding={1}
      width={boxWidth}
    >
      <Text bold color="blue">Add Comment</Text>
      <Text color="gray">File: {fileName}</Text>
      <Text color="gray">Line: {lineText.slice(0, 60)}{lineText.length > 60 ? '...' : ''}</Text>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        padding={1}
        minHeight={3}
      >
        {lines.length === 1 
          ? commentInput.renderText(' ')  // Single line - show cursor
          : lines.map((line, index) => <Text key={index}>{line || ' '}</Text>)  // Multi-line - no cursor for simplicity
        }
      </Box>
      <Text color="gray">
        Enter: Save  Shift+Enter: New Line  Esc: Cancel
      </Text>
    </Box>
  );
});

export default CommentInputDialog;