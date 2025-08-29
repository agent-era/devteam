import {useMemo} from 'react';
import type {WorktreeInfo} from '../../../../models.js';
import {stringDisplayWidth} from '../../../../shared/utils/formatting.js';
import {formatNumber, formatDiffStats, formatGitChanges, formatPRStatus} from '../utils.js';

export interface ColumnWidths {
  number: number;
  projectFeature: number;
  ai: number;
  diff: number;
  changes: number;
  pushed: number;
  pr: number;
}

/**
 * Calculate optimal column widths based on terminal width and content
 */
export function useColumnWidths(
  worktrees: WorktreeInfo[],
  terminalWidth: number,
  page: number,
  pageSize: number
): ColumnWidths {
  return useMemo(() => {
    const start = page * pageSize;
    const pageItems = worktrees.slice(start, start + pageSize);
    
    // Header row for width calculation
    const headerRow = ['#', 'PROJECT/FEATURE', 'AI', 'DIFF', 'CHANGES', 'PUSHED', 'PR'];
    
    // Format data rows for width calculation
    const dataRows = pageItems.map((w, i0) => {
      const added = w.git?.base_added_lines || 0;
      const deleted = w.git?.base_deleted_lines || 0;
      const diffStr = formatDiffStats(added, deleted);
      
      const ahead = w.git?.ahead || 0;
      const behind = w.git?.behind || 0;
      const changes = formatGitChanges(ahead, behind);
      
      // PUSHED column: show push status to remote
      let pushed = '-';
      if (w.git?.has_remote) {
        pushed = (w.git.ahead === 0 && !w.git.has_changes) ? '✓' : '↗';
      }
      
      const prStr = formatPRStatus(w.pr);
      
      return [
        String(start + i0 + 1),
        `${w.project}/${w.feature}`,
        'AI', // placeholder for AI symbol
        diffStr,
        changes,
        pushed,
        prStr
      ];
    });
    
    const allRows = [headerRow, ...dataRows];
    
    // Calculate content-based widths for all columns except PROJECT/FEATURE (index 1)
    const fixedWidths = [0, 1, 2, 3, 4, 5, 6].map(colIndex => {
      if (colIndex === 1) return 0; // PROJECT/FEATURE will be calculated separately
      const maxContentWidth = Math.max(...allRows.map(row => stringDisplayWidth(row[colIndex] || '')));
      return Math.max(4, maxContentWidth); // Minimum 4 chars for readability
    });
    
    // Calculate space used by fixed columns + margins (6 spaces between 7 columns)
    const fixedColumnsWidth = fixedWidths.reduce((sum, width, index) => index === 1 ? sum : sum + width, 0);
    const marginsWidth = 6; // 6 spaces between columns
    const usedWidth = fixedColumnsWidth + marginsWidth;
    
    // Calculate available width for PROJECT/FEATURE column
    const availableWidth = Math.max(15, terminalWidth - usedWidth); // Minimum 15 chars for readability  
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