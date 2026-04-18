import {useMemo} from 'react';
import type {WorktreeInfo} from '../../../../models.js';

export interface ColumnWidths {
  number: number;
  status: number;
  projectFeature: number;
  ai: number;
  diff: number;
  changes: number;
  pr: number;
}

export function useColumnWidths(
  worktrees: WorktreeInfo[],
  terminalWidth: number,
  page: number,
  pageSize: number
): ColumnWidths {
  return useMemo(() => {
    // Fixed column widths as specified
    const fixedWidths = {
      number: 3,
      status: 13,
      ai: 7,
      diff: 11,
      changes: 8,
      pr: 8,
    };

    const fixedColumnsWidth = fixedWidths.number + fixedWidths.status + fixedWidths.ai +
                             fixedWidths.diff + fixedWidths.changes + fixedWidths.pr;
    const marginsWidth = 6; // 6 spaces between 7 columns
    const usedWidth = fixedColumnsWidth + marginsWidth;
    
    const availableWidth = Math.max(15, terminalWidth - usedWidth);
    
    return {
      number: fixedWidths.number,
      status: fixedWidths.status,
      projectFeature: availableWidth,
      ai: fixedWidths.ai,
      diff: fixedWidths.diff,
      changes: fixedWidths.changes,
      pr: fixedWidths.pr,
    };
  }, [terminalWidth]); // Only depends on terminal width now
}
