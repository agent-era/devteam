import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {AI_TOOLS} from '../../constants.js';
import type {AITool} from '../../models.js';

type Props = {
  availableTools: (keyof typeof AI_TOOLS)[];
  currentTool?: AITool;
  onSelect: (tool: keyof typeof AI_TOOLS) => void;
  onCancel: () => void;
};

export default function AIToolDialog({availableTools, currentTool, onSelect, onCancel}: Props) {
  const [selected, setSelected] = useState(() => {
    if (currentTool && currentTool !== 'none') {
      const idx = availableTools.indexOf(currentTool);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });

  useInput((input, key) => {
    if (key.escape) return onCancel();
    
    if (key.return) {
      const tool = availableTools[selected];
      if (tool) onSelect(tool);
      return;
    }
    
    // Navigation keys
    if (key.downArrow || input === 'j') {
      setSelected((s) => Math.min(availableTools.length - 1, s + 1));
      return;
    }
    if (key.upArrow || input === 'k') {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    
    // Number keys for quick selection (1-9)
    if (/^[1-9]$/.test(input)) {
      const idx = Number(input) - 1;
      if (idx >= 0 && idx < availableTools.length) {
        onSelect(availableTools[idx]);
      }
      return;
    }
  });

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
      {availableTools.map((tool, i) => {
        const config = AI_TOOLS[tool];
        const isSelected = i === selected;
        const isCurrent = tool === currentTool;
        
        return (
          <Box key={tool} flexDirection="row">
            <Text color={isSelected ? 'green' : undefined}>
              {isSelected ? '› ' : '  '}[{i + 1}] {config.name}{isCurrent ? ' (current)' : ''}
            </Text>
          </Box>
        );
      })}
      <Text></Text>
      <Text color="gray">Selected: {AI_TOOLS[availableTools[selected]]?.name || 'None'}</Text>
    </Box>
  );
}