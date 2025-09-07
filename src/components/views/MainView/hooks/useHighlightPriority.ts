import {useMemo} from 'react';
import type {WorktreeInfo, PRStatus} from '../../../../models.js';

export interface HighlightInfo {
  columnIndex: number;
  color: string;
  reason: string;
}

const COLUMNS = {
  NUMBER: 0,
  PROJECT_FEATURE: 1, 
  AI: 2,
  DIFF: 3,
  CHANGES: 4,
  PUSHED: 5,
  PR: 6
} as const;

const COLORS = {
  YELLOW: 'yellow',  // Attention needed
  RED: 'red',        // Urgent action needed  
  GREEN: 'green'     // Ready/good state
} as const;

export function useHighlightPriority(worktree: WorktreeInfo, pr: PRStatus | undefined | null): HighlightInfo | null {
  return useMemo(() => {
    const cs = (worktree.session?.claude_status || '').toLowerCase();
    
    // Skip all highlighting if agent is working/thinking or PR is merged (dimmed)
    const isDimmed = pr?.is_merged === true || pr?.state === 'MERGED';
    if (cs.includes('working') || cs.includes('thinking') || isDimmed) {
      return null;
    }
    
    // PRIORITY 1: Claude waiting for input (highest priority - blocks all work)
    if (cs.includes('waiting')) {
      return {
        columnIndex: COLUMNS.AI,
        color: COLORS.YELLOW,
        reason: 'claude-waiting'
      };
    }
    
    // PRIORITY 2: Unstaged changes (need to commit before doing anything else)
    if (worktree.git?.has_changes) {
      return {
        columnIndex: COLUMNS.DIFF,
        color: COLORS.YELLOW,
        reason: 'unstaged-changes'
      };
    }
    
    // PRIORITY 3: Unpushed commits (commits ready to push/sync)
    if ((worktree.git?.ahead || 0) > 0) {
      return {
        columnIndex: COLUMNS.PUSHED,
        color: COLORS.YELLOW,
        reason: 'unpushed-commits'
      };
    }
    
    // PRIORITY 4+: PR-related priorities (only if PR status has been loaded)
    if (pr) {
      // PRIORITY 4: PR has merge conflicts (highest PR priority)
      if (pr.has_conflicts) {
        return {
          columnIndex: COLUMNS.PR,
          color: COLORS.RED,
          reason: 'pr-conflicts'
        };
      }
      
      // PRIORITY 5: PR needs attention (failing checks, etc.)
      if (pr.checks === 'failing') {
        return {
          columnIndex: COLUMNS.PR,
          color: COLORS.RED,
          reason: 'pr-needs-attention'
        };
      }
      
      // PRIORITY 6: PR ready to merge (positive action available)
      if (pr.is_ready_to_merge) {
        return {
          columnIndex: COLUMNS.PR,
          color: COLORS.GREEN,
          reason: 'pr-ready-to-merge'
        };
      }
      
      // PRIORITY 7: PR exists but no urgent action (informational)
      if (pr.is_open && pr.number) {
        return {
          columnIndex: COLUMNS.PR,
          color: COLORS.YELLOW,
          reason: 'pr-informational'
        };
      }
      
      // PRIORITY 7.5: PR successfully merged (completed work)
      if (pr.is_merged && pr.number) {
        return {
          columnIndex: COLUMNS.PR,
          color: COLORS.GREEN,
          reason: 'pr-merged'
        };
      }
      
      // PRIORITY 8: Claude idle - ready for work (when nothing else needs attention)
      if (worktree.session?.attached && (cs.includes('idle') || cs.includes('active'))) {
        return {
          columnIndex: COLUMNS.AI,
          color: COLORS.GREEN,
          reason: 'claude-ready'
        };
      }
    }
    
    // No highlighting needed
    return null;
  }, [worktree, pr]);
}
