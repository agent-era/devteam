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
      number: 3,        // # column
      status: 13,       // STATUS column (already fixed)
      ai: 5,           // AGENT column (renamed from AI)
      diff: 11,        // DIFF column (increased by 2)
      changes: 8,      // CHANGES column
      pr: 8,           // PR column
    };
    
    // Calculate remaining space for PROJECT/FEATURE column
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
