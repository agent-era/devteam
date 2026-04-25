import React from 'react';
import {Box, Text} from 'ink';
import {padEndDisplay, stringDisplayWidth} from '../../../shared/utils/formatting.js';
import type {MdRow} from '../../../shared/utils/markdown/types.js';

interface Props {
  row: MdRow;
  width: number;
}

/**
 * Render a single MdRow as a styled Ink row. Each span becomes a `<Text>`
 * with its own color/bold/italic/dim props; spans compose horizontally
 * within a single-height `<Box>`.
 *
 * The row is right-padded with spaces up to `width` so background colours
 * (when used) extend to the right edge.
 */
export default function MarkdownRowView({row, width}: Props) {
  let used = 0;
  for (const s of row.spans) used += stringDisplayWidth(s.text);
  const trailing = Math.max(0, width - used);

  return (
    <Box flexDirection="row" height={1} flexShrink={0}>
      {row.spans.map((span, i) => (
        <Text
          key={i}
          bold={span.bold || undefined}
          italic={span.italic || undefined}
          dimColor={span.dim || undefined}
          color={span.color}
          inverse={span.inverse || undefined}
        >
          {span.text}
        </Text>
      ))}
      {trailing > 0 && <Text>{padEndDisplay('', trailing)}</Text>}
    </Box>
  );
}
