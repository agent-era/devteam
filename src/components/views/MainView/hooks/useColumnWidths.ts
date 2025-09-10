import {useMemo} from 'react';
import type {WorktreeInfo} from '../../../../models.js';
import {stringDisplayWidth} from '../../../../shared/utils/formatting.js';
import {formatNumber, formatDiffStats, formatGitChanges, formatPRStatus} from '../utils.js';
import {useGitHubContext} from '../../../../contexts/GitHubContext.js';
import {computeHighlightInfo, getStatusMeta} from '../highlight.js';

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
  // Read PR status directly from provider state to avoid expensive loads during render
  let pullRequests: Record<string, any> = {};
  try {
    ({pullRequests} = useGitHubContext() as any);
  } catch {
    // In non-context renders (tests), fall back to empty map
    pullRequests = {} as any;
  }

  return useMemo(() => {
    const start = page * pageSize;
    const pageItems = worktrees.slice(start, start + pageSize);
    
    const headerRow = ['#', 'STATUS', 'PROJECT/FEATURE', 'AI', 'DIFF', 'CHANGES', 'PR'];
    const dataRows = pageItems.map((w, i0) => {
      const added = w.git?.base_added_lines || 0;
      const deleted = w.git?.base_deleted_lines || 0;
      const diffStr = formatDiffStats(added, deleted);
      
      const ahead = w.git?.ahead || 0;
      const behind = w.git?.behind || 0;
      const changes = formatGitChanges(ahead, behind);
      
      const prObj = pullRequests[w.path];
      const prStr = formatPRStatus(prObj);
      const statusMeta = getStatusMeta(w, prObj);
      const statusLabel = statusMeta.label;
      return [
        String(start + i0 + 1),
        statusLabel,
        `${w.project}/${w.feature}`,
        'AI',
        diffStr,
        changes,
        prStr
      ];
    });
    
    const allRows = [headerRow, ...dataRows];
    
    const fixedWidths = [0, 1, 2, 3, 4, 5, 6].map(colIndex => {
      if (colIndex === 2) return 0; // dynamic PROJECT/FEATURE
      if (colIndex === 1) return 13; // fixed STATUS column width
      const maxContentWidth = Math.max(...allRows.map(row => stringDisplayWidth(row[colIndex] || '')));
      return Math.max(4, maxContentWidth);
    });
    
    // Exclude the dynamic PROJECT/FEATURE column (index 2) from the fixed width sum
    const fixedColumnsWidth = fixedWidths.reduce((sum, width, index) => index === 2 ? sum : sum + width, 0);
    const marginsWidth = headerRow.length - 1; // one space between columns
    const usedWidth = fixedColumnsWidth + marginsWidth;
    
    const availableWidth = Math.max(15, terminalWidth - usedWidth);
    fixedWidths[2] = Math.min(availableWidth, terminalWidth - usedWidth);
    
    return {
      number: fixedWidths[0],
      status: fixedWidths[1],
      projectFeature: fixedWidths[2],
      ai: fixedWidths[3],
      diff: fixedWidths[4],
      changes: fixedWidths[5],
      pr: fixedWidths[6],
    };
  }, [worktrees, terminalWidth, page, pageSize, pullRequests]);
}
