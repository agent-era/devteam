import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
const h = React.createElement;

type Props = {
  fileName: string;
  lineText: string;
  initialComment?: string;
  onSave: (comment: string) => void;
  onCancel: () => void;
};

export default function CommentInputDialog({fileName, lineText, initialComment = '', onSave, onCancel}: Props) {
  const [comment, setComment] = useState(initialComment);
  const [cursorPosition, setCursorPosition] = useState(initialComment.length);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return && !key.shift) {
      if (comment.trim()) {
        onSave(comment.trim());
      } else {
        onCancel();
      }
      return;
    }

    if (key.return && key.shift) {
      const newComment = comment.slice(0, cursorPosition) + '\n' + comment.slice(cursorPosition);
      setComment(newComment);
      setCursorPosition(cursorPosition + 1);
      return;
    }

    if (key.backspace || key.delete) {
      if (comment.length > 0 && cursorPosition > 0) {
        const newComment = comment.slice(0, cursorPosition - 1) + comment.slice(cursorPosition);
        setComment(newComment);
        setCursorPosition(Math.max(0, cursorPosition - 1));
      }
      return;
    }

    if (key.leftArrow) {
      setCursorPosition(Math.max(0, cursorPosition - 1));
      return;
    }

    if (key.rightArrow) {
      setCursorPosition(Math.min(comment.length, cursorPosition + 1));
      return;
    }

    if (key.upArrow || key.downArrow) {
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const newComment = comment.slice(0, cursorPosition) + input + comment.slice(cursorPosition);
      setComment(newComment);
      setCursorPosition(cursorPosition + input.length);
    }
  });

  const displayComment = comment || '';
  const beforeCursor = displayComment.slice(0, cursorPosition);
  const atCursor = displayComment.slice(cursorPosition, cursorPosition + 1) || ' ';
  const afterCursor = displayComment.slice(cursorPosition + 1);

  const lines = displayComment.split('\n');
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
      ...lines.map((line, index) => {
        if (index === 0 && lines.length === 1) {
          return h(
            Text,
            {key: index},
            h(Text, {}, beforeCursor),
            h(Text, {inverse: true}, atCursor),
            h(Text, {}, afterCursor)
          );
        }
        return h(Text, {key: index}, line || ' ');
      })
    ),
    h(
      Text,
      {color: 'gray'},
      'Enter: Save  Shift+Enter: New Line  Esc: Cancel'
    )
  );
}