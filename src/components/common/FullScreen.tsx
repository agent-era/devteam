import React, {useEffect, useState} from 'react';
import {Box, useStdout} from 'ink';

function useAltScreen(enabled: boolean) {
  const {stdout} = useStdout();
  useEffect(() => {
    if (!enabled || !stdout || !stdout.isTTY) return;
    try {
      // Enter alternate screen buffer and hide cursor
      stdout.write('\x1b[?1049h');
      stdout.write('\x1b[?25l');
    } catch {}
    return () => {
      try {
        // Show cursor and leave alternate screen
        stdout.write('\x1b[?25h');
        stdout.write('\x1b[?1049l');
      } catch {}
    };
  }, [enabled, stdout]);
}

export default function FullScreen(props: {children: any; enableAltScreen?: boolean}) {
  const {enableAltScreen = true} = props;
  const {stdout} = useStdout();
  const [dims, setDims] = useState<{columns: number; rows: number}>(() => ({columns: stdout?.columns || 80, rows: stdout?.rows || 24}));
  useAltScreen(enableAltScreen);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => setDims({columns: stdout.columns || 80, rows: stdout.rows || 24});
    // Initialize immediately and then listen for further changes
    onResize();
    // @ts-ignore 'resize' exists on TTY streams
    stdout.on?.('resize', onResize);
    return () => { stdout.off?.('resize', onResize as any); };
  }, [stdout]);

  // Leave one row at the bottom to avoid terminal scroll on last-line newline
  const usableRows = Math.max(1, (dims.rows || 1) - 1);
  return (
    <Box width={dims.columns} height={usableRows} flexDirection="column">
      {props.children}
    </Box>
  );
}
