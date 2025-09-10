import React from 'react';
import {Box, Text} from 'ink';
import {stringDisplayWidth} from '../../shared/utils/formatting.js';

interface StatusChipProps {
  label: string;
  color: string; // background color
  fg?: string;   // foreground color
  width?: number; // optional fixed width for alignment
}

export default function StatusChip({label, color, fg = 'white', width}: StatusChipProps) {
  // Create a string that exactly fills the width with background, centered label
  const makeChip = (): string => {
    const base = ` ${label} `; // padding around the label
    if (!width || width <= 0) return base;
    const max = Math.max(1, width);
    let visible = base;
    if (stringDisplayWidth(visible) > max) {
      // Truncate label to fit width including padding
      const inner = Math.max(0, max - 2);
      const truncated = label.slice(0, inner);
      visible = ` ${truncated}`.padEnd(max, ' ');
      return visible;
    }
    const pad = max - stringDisplayWidth(visible);
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return ' '.repeat(left) + visible + ' '.repeat(right);
  };

  const chip = makeChip();
  return (
    <Box width={width} justifyContent="flex-start">
      <Text backgroundColor={color} color={fg}>
        {chip}
      </Text>
    </Box>
  );
}
