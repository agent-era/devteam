import React from 'react';
import {Box} from 'ink';
import MarkdownRowView from './MarkdownRowView.js';
import type {MdRow} from '../../../shared/utils/markdown/types.js';

interface Props {
  rows: MdRow[];
  width: number;
  height: number;
  scrollTop: number;
}

/**
 * Viewport over a flat array of pre-rendered markdown rows. Owns no scroll
 * state itself — the host screen passes `scrollTop` and decides how to
 * react to keys. This keeps the viewer reusable for the tracker detail
 * screen and any future surface (e.g. a standalone reader).
 */
export default function MarkdownView({rows, width, height, scrollTop}: Props) {
  const safeHeight = Math.max(1, height);
  const start = Math.max(0, Math.min(scrollTop, Math.max(0, rows.length - safeHeight)));
  const visible = rows.slice(start, start + safeHeight);

  return (
    <Box flexDirection="column" height={safeHeight}>
      {visible.map((row, i) => (
        <MarkdownRowView key={start + i} row={row} width={width} />
      ))}
    </Box>
  );
}
