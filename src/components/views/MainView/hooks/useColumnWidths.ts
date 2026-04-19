import {useMemo} from 'react';
import type {WorktreeInfo} from '../../../../models.js';

export interface ColumnWidths {
  number: number;
  status: number;
  ai: number;
  shell: number;
  run: number;
  projectFeature: number;
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
    const fixedWidths = {
      number: 3,
      status: 13,
      ai: 5,
      shell: 5,
      run: 5,
      diff: 11,
      changes: 8,
      pr: 8,
    };

    const fixedColumnsWidth = fixedWidths.number + fixedWidths.status + fixedWidths.ai +
                              fixedWidths.shell + fixedWidths.run +
                              fixedWidths.diff + fixedWidths.changes + fixedWidths.pr;
    const marginsWidth = 8; // 8 spaces between 9 columns
    const usedWidth = fixedColumnsWidth + marginsWidth;

    const availableWidth = Math.max(5, terminalWidth - usedWidth);

    return {
      number: fixedWidths.number,
      status: fixedWidths.status,
      ai: fixedWidths.ai,
      shell: fixedWidths.shell,
      run: fixedWidths.run,
      projectFeature: availableWidth,
      diff: fixedWidths.diff,
      changes: fixedWidths.changes,
      pr: fixedWidths.pr,
    };
  }, [terminalWidth]);
}
