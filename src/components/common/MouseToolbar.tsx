import React, {useMemo, useRef, useState} from 'react';
import {Box, Text, useStdout} from 'ink';
import {useMouse} from '../../hooks/useMouse.js';
import {useWorktreeContext} from '../../contexts/WorktreeContext.js';
import {useUIContext} from '../../contexts/UIContext.js';

type Button = {
  id: string;
  label: string;
  action: () => void;
};

export default function MouseToolbar() {
  const {stdout} = useStdout();
  const {getSelectedWorktree, attachSession, attachShellSession} = useWorktreeContext();
  const {showHelp, requestExit, showDiffView, showRunConfig, runWithLoading, showList} = useUIContext();
  const [lastClick, setLastClick] = useState<{x: number; y: number} | null>(null);

  const buttons = useMemo<Button[]>(() => [
    { id: 'attach', label: 'Attach', action: () => {
      const wt = getSelectedWorktree(); if (!wt) return; runWithLoading(() => attachSession(wt));
    }},
    { id: 'shell', label: 'Shell', action: () => {
      const wt = getSelectedWorktree(); if (!wt) return; runWithLoading(() => attachShellSession(wt));
    }},
    { id: 'diff', label: 'Diff', action: () => {
      const wt = getSelectedWorktree(); if (!wt) return; showDiffView(wt.path, 'full');
    }},
    { id: 'config', label: 'Run Config', action: () => {
      const wt = getSelectedWorktree(); if (!wt) return; showRunConfig(wt.project, wt.feature, wt.path);
    }},
    { id: 'help', label: 'Help', action: () => showHelp() },
    { id: 'quit', label: 'Quit', action: () => requestExit() },
  ], [getSelectedWorktree, attachSession, attachShellSession, showHelp, requestExit, showDiffView, showRunConfig, runWithLoading]);

  // Compute x ranges for each button assuming format: [ label ] with a space between
  const rangesRef = useRef<{start: number; end: number; id: string}[]>([]);
  const computeRanges = (colStart: number) => {
    let x = colStart;
    rangesRef.current = buttons.map(b => {
      const width = b.label.length + 4; // [ label ]
      const start = x;
      const end = x + width - 1;
      x = end + 2; // space between buttons
      return {start, end, id: b.id};
    });
  };

  useMouse({
    onEvent: ev => {
      // Only handle clicks on the last visible row (or second to last as a buffer)
      const rows = stdout?.rows || 24;
      if (ev.type !== 'down') return;
      if (!(ev.y === rows - 1 || ev.y === rows - 2)) return;
      const hit = rangesRef.current.find(r => ev.x >= r.start && ev.x <= r.end);
      if (hit) {
        setLastClick({x: ev.x, y: ev.y});
        const btn = buttons.find(b => b.id === hit.id);
        btn?.action();
      }
    }
  });

  // Render toolbar
  // Recompute ranges at render time from column 2 to give some left padding
  computeRanges(2);

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      {buttons.map((b, i) => (
        <Box key={b.id} marginRight={1}>
          <Text>
            {'['} <Text bold>{b.label}</Text> {']'}{i < buttons.length - 1 ? ' ' : ''}
          </Text>
        </Box>
      ))}
      <Box flexGrow={1} />
      {lastClick ? (
        <Text dimColor>
          {' '}
          click {lastClick.x},{lastClick.y}
        </Text>
      ) : null}
    </Box>
  );
}

