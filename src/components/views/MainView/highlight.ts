import type {WorktreeInfo, PRStatus} from '../../../models.js';
import { computeWorktreeStatus, computeAIWorktreeStatus, WorktreeStatusReason } from '../../../cores/WorktreeStatus.js';
export { WorktreeStatusReason as StatusReason } from '../../../cores/WorktreeStatus.js';

export interface HighlightInfo {
  columnIndex: number;
  color: string;
  reason: WorktreeStatusReason | string;
}

export const COLUMNS = {
  NUMBER: 0,
  PROJECT_FEATURE: 1,
  AI: 2,
  DIFF: 3,
  CHANGES: 4,
  PR: 5,
} as const;

export const COLORS = {
  YELLOW: 'yellow',
  RED: 'red',
  GREEN: 'green',
} as const;

// Enum for semantic status reasons (presentation-agnostic)
// StatusReason is re-exported from core to avoid duplication

// Determine the semantic status reason without presentation concerns
export function determineStatusReason(worktree: WorktreeInfo, pr: PRStatus | undefined | null): WorktreeStatusReason | null {
  const st = computeWorktreeStatus(worktree, pr);
  if (!st || st.reason === WorktreeStatusReason.NONE) return null;
  return st.reason;
}

export function computeHighlightInfo(worktree: WorktreeInfo, pr: PRStatus | undefined | null): HighlightInfo | null {
  const st = computeWorktreeStatus(worktree, pr);
  // UI-only rules: do not highlight when agent is working/thinking or PR is merged
  if (st.reason === WorktreeStatusReason.AGENT_WORKING || st.reason === WorktreeStatusReason.PR_MERGED) return null;

  // Logical aspect to column index mapping remains UI-only
  let columnIndex: number;
  switch (st.aspect) {
    case 'agent': columnIndex = COLUMNS.AI; break;
    case 'diff': columnIndex = COLUMNS.DIFF; break;
    case 'sync': columnIndex = COLUMNS.CHANGES; break;
    case 'pr': columnIndex = COLUMNS.PR; break;
    default: return null;
  }

  // Simple color emphasis derived from reason category
  let color: string = COLORS.YELLOW;
  switch (st.reason) {
    case WorktreeStatusReason.PR_CONFLICTS:
    case WorktreeStatusReason.PR_FAILING:
      color = COLORS.RED; break;
    case WorktreeStatusReason.PR_READY_TO_MERGE:
    case WorktreeStatusReason.AGENT_READY:
      color = COLORS.GREEN; break;
    default:
      color = COLORS.YELLOW; break;
  }

  return { columnIndex, color, reason: st.reason };
}

export function statusLabelFromReason(reason: WorktreeStatusReason | string | null | undefined): string {
  if (!reason) return '';
  // Route through core labels for consistency
  switch (reason) {
    case WorktreeStatusReason.AGENT_WAITING: return 'waiting';
    case WorktreeStatusReason.AGENT_WORKING: return 'working';
    case WorktreeStatusReason.AGENT_READY: return 'ready';
    case WorktreeStatusReason.UNCOMMITTED_CHANGES: return 'uncommitted';
    case WorktreeStatusReason.UNPUSHED_COMMITS: return 'not pushed';
    case WorktreeStatusReason.PR_CONFLICTS: return 'conflict';
    case WorktreeStatusReason.PR_FAILING: return 'pr failed';
    case WorktreeStatusReason.PR_READY_TO_MERGE: return 'pr ready';
    case WorktreeStatusReason.PR_CHECKING: return 'checking pr';
    case WorktreeStatusReason.NO_PR: return 'no pr';
    case WorktreeStatusReason.PR_MERGED: return 'merged';
    default: return '';
  }
}

export function statusColorsFromReason(reason: WorktreeStatusReason | string | null | undefined): {bg: string; fg: string} {
  // All statuses default to white text for readability
  const fg = 'white';
  switch (reason) {
    case WorktreeStatusReason.AGENT_WAITING:
      return {bg: 'yellow', fg};
    case WorktreeStatusReason.AGENT_WORKING:
      return {bg: 'none', fg: 'white'};
    case WorktreeStatusReason.UNCOMMITTED_CHANGES:
      // Plain colored text for modified
      return {bg: 'none', fg: 'blue'};
    case WorktreeStatusReason.UNPUSHED_COMMITS:
      return {bg: 'cyan', fg};
    case WorktreeStatusReason.PR_CONFLICTS:
      return {bg: 'red', fg};
    case WorktreeStatusReason.PR_FAILING:
      return {bg: 'red', fg};
    case WorktreeStatusReason.PR_READY_TO_MERGE:
      return {bg: 'green', fg};
    case WorktreeStatusReason.PR_CHECKING:
      // No background; use magenta text
      return {bg: 'none', fg: 'magenta'};
    case WorktreeStatusReason.NO_PR:
      // Plain cyan text 'no pr' with no background
      return {bg: 'none', fg: 'cyan'};
    case WorktreeStatusReason.PR_MERGED:
      // Plain grey text 'merged' with no background
      return {bg: 'none', fg: 'gray'};
    case WorktreeStatusReason.AGENT_READY:
      // Show text 'ready' but with default (black) background
      return {bg: 'black', fg};
    default:
      return {bg: 'gray', fg};
  }
}

export function getStatusMeta(
  worktree: WorktreeInfo,
  pr: PRStatus | undefined | null
): {label: string; bg: string; fg: string} {
  const st = computeWorktreeStatus(worktree, pr);
  // Colors remain a UI concern here; reuse mapping by reason
  const reason = st.reason;
  const { bg, fg } = statusColorsFromReason(reason);
  return { label: statusLabelFromReason(reason), bg, fg };
}

// AI-only status meta, useful for rows that should reflect just agent state (e.g., workspace headers)
export function getAIStatusMeta(
  worktree: WorktreeInfo,
): {label: string; bg: string; fg: string} {
  const st = computeAIWorktreeStatus(worktree);
  const reason = st.reason;
  const { bg, fg } = statusColorsFromReason(reason);
  return { label: statusLabelFromReason(reason), bg, fg };
}
