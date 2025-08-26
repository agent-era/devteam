import React, {useEffect, useState} from 'react';
import {Box, useStdout} from 'ink';
const h = React.createElement;

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
  const [dims, setDims] = useState<{columns: number; rows: number}>(() => ({columns: process.stdout.columns || 80, rows: process.stdout.rows || 24}));
  useAltScreen(enableAltScreen);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => setDims({columns: process.stdout.columns || 80, rows: process.stdout.rows || 24});
    stdout.on('resize', onResize);
    return () => { stdout.off?.('resize', onResize as any); };
  }, [stdout]);

  return h(Box, {width: dims.columns, height: dims.rows, flexDirection: 'column'}, props.children);
}

