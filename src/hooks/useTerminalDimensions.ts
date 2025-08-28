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
    columns: stdout?.columns || process.stdout.columns || 80,
    rows: stdout?.rows || process.stdout.rows || 24
  }));

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        columns: stdout?.columns || process.stdout.columns || 80,
        rows: stdout?.rows || process.stdout.rows || 24
      });
    };

    // Listen for resize events
    process.stdout.on('resize', updateDimensions);
    
    // Cleanup
    return () => {
      process.stdout.off('resize', updateDimensions);
    };
  }, [stdout]);

  return dimensions;
}