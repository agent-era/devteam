import React, {useState, useRef} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInputAdapter from '../common/TextInputAdapter.js';

type Props = {
  fileName: string;
  lineText: string;
  initialComment?: string;
  onSave: (comment: string) => void;
  onCancel: () => void;
};

const CommentInputDialog = React.memo(function CommentInputDialog({fileName, lineText, initialComment = '', onSave, onCancel}: Props) {
  const [comment, setComment] = useState(initialComment);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return && key.shift) {
      // Handle newlines for multi-line comments
      setComment(prev => prev + '\n');
      return;
    }
  });

  const handleSubmit = (value: string) => {
    if (value.trim()) {
      onSave(value.trim());
    } else {
      onCancel();
    }
  };

  const handleChange = (value: string) => {
    setComment(value);
  };

  const lines = comment.split('\n');
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
        <TextInputAdapter
          initialValue={initialComment}
          placeholder=" "
          onSubmit={handleSubmit}
          onChange={handleChange}
          focusId="comment-input-dialog"
          multiline={true}
        />
      </Box>
      <Text color="gray">
        Enter: Save  Shift+Enter: New Line  Esc: Cancel
      </Text>
    </Box>
  );
});

export default CommentInputDialog;