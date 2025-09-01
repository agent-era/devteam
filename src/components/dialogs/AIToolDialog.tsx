import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import {AI_TOOLS} from '../../constants.js';
import type {AITool} from '../../models.js';
import SelectAdapter, {type SelectOption} from '../common/SelectAdapter.js';

type Props = {
  availableTools: (keyof typeof AI_TOOLS)[];
  currentTool?: AITool;
  onSelect: (tool: keyof typeof AI_TOOLS) => void;
  onCancel: () => void;
};

export default function AIToolDialog({availableTools, currentTool, onSelect, onCancel}: Props) {
  const options: SelectOption[] = useMemo(() => {
    return availableTools.map((tool, i) => ({
      label: `[${i + 1}] ${AI_TOOLS[tool].name}${tool === currentTool ? ' (current)' : ''}`,
      value: tool
    }));
  }, [availableTools, currentTool]);

  const defaultSelected = useMemo(() => {
    if (currentTool && currentTool !== 'none') {
      const idx = availableTools.indexOf(currentTool);
      return idx >= 0 ? availableTools[idx] : availableTools[0];
    }
    return availableTools[0];
  }, [availableTools, currentTool]);

  const handleSelect = (toolValue: string) => {
    onSelect(toolValue as keyof typeof AI_TOOLS);
  };

  if (availableTools.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="red">No AI Tools Available</Text>
        <Text>No supported AI tools (Claude, Codex, Gemini) were found on this system.</Text>
        <Text color="gray">Press ESC to cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan">Select AI Tool</Text>
      <Text color="gray">j/k arrows to move, 1-9 quick select, Enter to confirm, ESC to cancel</Text>
      <Text></Text>
      <SelectAdapter
        options={options}
        onSelect={handleSelect}
        onCancel={onCancel}
        defaultSelected={defaultSelected}
        focusId="ai-tool-dialog"
        supportNumberSelection={true}
        supportJKNavigation={true}
      />
    </Box>
  );
}