import {useEffect, useState} from 'react';
import {useStdout} from 'ink';

interface TerminalDimensions {
  columns: number;
  rows: number;
}

/**
 * Custom hook for getting terminal dimensions using Ink's useStdout
 * Updates dimensions when terminal is resized
 */
export function useTerminalDimensions(): TerminalDimensions {
  const {stdout} = useStdout();

  const [dimensions, setDimensions] = useState<TerminalDimensions>(() => ({
    columns: stdout?.columns || 80,
    rows: stdout?.rows || 24
  }));

  useEffect(() => {
    if (!stdout) return;
    const updateDimensions = () => {
      setDimensions({
        columns: stdout.columns || 80,
        rows: stdout.rows || 24
      });
    };

    // Initialize from current stdout and listen for resize on the Ink stdout stream
    updateDimensions();
    // @ts-ignore - node streams may support 'resize' event
    stdout.on?.('resize', updateDimensions);

    return () => {
      // @ts-ignore
      stdout.off?.('resize', updateDimensions);
    };
  }, [stdout]);

  return dimensions;
}
