import React from 'react';
import {Box, Text} from 'ink';
import {stringDisplayWidth} from '../../shared/utils/formatting.js';

interface StatusChipProps {
  label: string;
  color: string | undefined; // background color; 'none' or undefined => no background
  fg?: string;   // foreground color
  width?: number; // optional fixed width for alignment
}

export default function StatusChip({label, color, fg = 'white', width}: StatusChipProps) {
  const isPlain = !color || color === 'none' || color === 'transparent';

  // Plain text mode (no background, left-aligned, magenta etc.)
  if (isPlain) {
    const makePlain = (): string => {
      const base = label;
      if (!width || width <= 0) return base;
      let visible = base;
      if (stringDisplayWidth(visible) > width) {
        visible = visible.slice(0, Math.max(0, width));
      }
      const pad = Math.max(0, width - stringDisplayWidth(visible));
      // Tie-break toward left: put extra space on the left when pad is odd
      const left = Math.ceil(pad / 2);
      const right = pad - left;
      return ' '.repeat(left) + visible + ' '.repeat(right);
    };

    return (
      <Box width={width} justifyContent="flex-start">
        <Text color={fg}>{makePlain()}</Text>
      </Box>
    );
  }

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
    // Tie-break toward left: put extra space on the left when pad is odd
    const left = Math.ceil(pad / 2);
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
