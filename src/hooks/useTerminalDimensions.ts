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

  const readDims = (): TerminalDimensions => {
    const envCols = Number(process.env.E2E_TTY_COLS || '');
    const envRows = Number(process.env.E2E_TTY_ROWS || '');
    const columns = (Number.isFinite(envCols) && envCols > 0) ? envCols : (stdout?.columns || 80);
    const rows = (Number.isFinite(envRows) && envRows > 0) ? envRows : (stdout?.rows || 24);
    return {columns, rows};
  };

  const [dimensions, setDimensions] = useState<TerminalDimensions>(readDims);

  useEffect(() => {
    if (!stdout) return;
    const updateDimensions = () => setDimensions(readDims());

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
