import React, {useMemo, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {AI_TOOLS} from '../../constants.js';
import type {AITool} from '../../models.js';
import {Select} from '@inkjs/ui';
import AnnotatedText from '../common/AnnotatedText.js';
type SelectOption = {label: string; value: string};
import {useInputFocus} from '../../contexts/InputFocusContext.js';

type Props = {
  availableTools: (keyof typeof AI_TOOLS)[];
  currentTool?: AITool;
  onSelect: (tool: keyof typeof AI_TOOLS) => void;
  onCancel: () => void;
};

export default function AIToolDialog({availableTools, currentTool, onSelect, onCancel}: Props) {
  const {requestFocus, releaseFocus} = useInputFocus();
  useEffect(() => {
    requestFocus('ai-tool-dialog');
    return () => releaseFocus('ai-tool-dialog');
  }, [requestFocus, releaseFocus]);
  const options: SelectOption[] = useMemo(() => {
    return availableTools.map((tool, i) => ({
      label: `[${i + 1}] ${AI_TOOLS[tool].name}${tool === currentTool ? ' (current)' : ''}`,
      value: tool
    }));
  }, [availableTools, currentTool]);


  const handleSelect = (toolValue: string) => {
    onSelect(toolValue as keyof typeof AI_TOOLS);
  };

  // Basic keyboard handling for ESC and numeric quick select
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (/^[1-9]$/.test(input)) {
      const idx = Number(input) - 1;
      if (idx >= 0 && idx < availableTools.length) {
        onSelect(availableTools[idx]);
      }
    }
  });

  if (availableTools.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="red">No AI Tools Available</Text>
        <Text>No supported AI tools (Claude, Codex, Gemini) were found on this system.</Text>
        <Text color="magenta" wrap="truncate">Press ESC to cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan">Select AI Tool</Text>
      <Select
        options={options}
        onChange={handleSelect}
      />
      <Box marginTop={1}>
        <AnnotatedText color="magenta" wrap="truncate" text={"[j]/[k] move, [1]–[9] quick select, [enter] launch, [esc] cancel"} />
      </Box>
    </Box>
  );
}
