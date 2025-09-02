import {useMemo} from 'react';
import type {WorktreeInfo} from '../../../../models.js';
import {stringDisplayWidth} from '../../../../shared/utils/formatting.js';
import {formatNumber, formatDiffStats, formatGitChanges} from '../utils.js';

export interface ColumnWidths {
  number: number;
  projectFeature: number;
  ai: number;
  diff: number;
  changes: number;
  pushed: number;
  pr: number;
}

export function useColumnWidths(
  worktrees: WorktreeInfo[],
  terminalWidth: number,
  page: number,
  pageSize: number
): ColumnWidths {
  return useMemo(() => {
    const start = page * pageSize;
    const pageItems = worktrees.slice(start, start + pageSize);
    
    const headerRow = ['#', 'PROJECT/FEATURE', 'AI', 'DIFF', 'CHANGES', 'PUSHED', 'PR'];
    const dataRows = pageItems.map((w, i0) => {
      const added = w.git?.base_added_lines || 0;
      const deleted = w.git?.base_deleted_lines || 0;
      const diffStr = formatDiffStats(added, deleted);
      
      const ahead = w.git?.ahead || 0;
      const behind = w.git?.behind || 0;
      const changes = formatGitChanges(ahead, behind);
      
      let pushed = '-';
      if (w.git?.has_remote) {
        pushed = (w.git.ahead === 0 && !w.git.has_changes) ? '✓' : '↗';
      }
      
      return [
        String(start + i0 + 1),
        `${w.project}/${w.feature}`,
        'AI',
        diffStr,
        changes,
        pushed,
        '-'
      ];
    });
    
    const allRows = [headerRow, ...dataRows];
    
    const fixedWidths = [0, 1, 2, 3, 4, 5, 6].map(colIndex => {
      if (colIndex === 1) return 0;
      const maxContentWidth = Math.max(...allRows.map(row => stringDisplayWidth(row[colIndex] || '')));
      return Math.max(4, maxContentWidth);
    });
    
    // Force PR column width to a static size (8 chars)
    fixedWidths[6] = 8;
    
    const fixedColumnsWidth = fixedWidths.reduce((sum, width, index) => index === 1 ? sum : sum + width, 0);
    const marginsWidth = 6;
    const usedWidth = fixedColumnsWidth + marginsWidth;
    
    const availableWidth = Math.max(15, terminalWidth - usedWidth);
    fixedWidths[1] = Math.min(availableWidth, terminalWidth - usedWidth);
    
    return {
      number: fixedWidths[0],
      projectFeature: fixedWidths[1],
      ai: fixedWidths[2],
      diff: fixedWidths[3],
      changes: fixedWidths[4],
      pushed: fixedWidths[5],
      pr: fixedWidths[6],
    };
  }, [worktrees, terminalWidth, page, pageSize]);
}
