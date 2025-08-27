import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {useTextInput} from './TextInput.js';
const h = React.createElement;

type Props = {
  fileName: string;
  lineText: string;
  initialComment?: string;
  onSave: (comment: string) => void;
  onCancel: () => void;
};

export default function CommentInputDialog({fileName, lineText, initialComment = '', onSave, onCancel}: Props) {
  const commentInput = useTextInput(initialComment);

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

  return h(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'blue',
      padding: 1,
      width: boxWidth
    },
    h(Text, {bold: true, color: 'blue'}, 'Add Comment'),
    h(Text, {color: 'gray'}, `File: ${fileName}`),
    h(Text, {color: 'gray'}, `Line: ${lineText.slice(0, 60)}${lineText.length > 60 ? '...' : ''}`),
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: 'gray',
        padding: 1,
        minHeight: 3
      },
      lines.length === 1 
        ? commentInput.renderText(' ')  // Single line - show cursor
        : lines.map((line, index) => h(Text, {key: index}, line || ' '))  // Multi-line - no cursor for simplicity
    ),
    h(
      Text,
      {color: 'gray'},
      'Enter: Save  Shift+Enter: New Line  Esc: Cancel'
    )
  );
}