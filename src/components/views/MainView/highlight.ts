import type {WorktreeInfo, PRStatus} from '../../../models.js';
import { computeCodeStatus, computeWorktreeStatus, WorktreeStatusReason } from '../../../cores/WorktreeStatus.js';
export { WorktreeStatusReason as StatusReason } from '../../../cores/WorktreeStatus.js';

export interface HighlightInfo {
  columnIndex: number;
  color: string;
  reason: WorktreeStatusReason | string;
}

export const COLUMNS = {
  NUMBER: 0,
  AI: 1,
  SHELL: 2,
  RUN: 3,
  PROJECT_FEATURE: 4,
  DIFF: 5,
  CHANGES: 6,
  PR: 7,
} as const;

export const COLORS = {
  YELLOW: 'yellow',
  RED: 'red',
  GREEN: 'green',
} as const;

// Determine the semantic status reason without presentation concerns
export function determineStatusReason(worktree: WorktreeInfo, pr: PRStatus | undefined | null): WorktreeStatusReason | null {
  const st = computeCodeStatus(worktree, pr);
  if (!st || st.reason === WorktreeStatusReason.NONE) return null;
  return st.reason;
}

export function computeHighlightInfo(worktree: WorktreeInfo, pr: PRStatus | undefined | null): HighlightInfo | null {
  const st = computeCodeStatus(worktree, pr);
  if (st.reason === WorktreeStatusReason.PR_MERGED) return null;

  let columnIndex: number;
  switch (st.aspect) {
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
      color = COLORS.GREEN; break;
    case WorktreeStatusReason.AGENT_READY:
      // Match chip: plain white text for "ready"
      color = 'white'; break;
    default:
      color = COLORS.YELLOW; break;
  }

  return { columnIndex, color, reason: st.reason };
}

export function statusLabelFromReason(reason: WorktreeStatusReason | string | null | undefined): string {
  switch (reason) {
    case WorktreeStatusReason.AGENT_WORKING: return 'working';
    case WorktreeStatusReason.AGENT_WAITING: return 'waiting';
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
  switch (reason) {
    case WorktreeStatusReason.AGENT_WORKING: return {bg: 'none', fg: 'cyan'};
    case WorktreeStatusReason.AGENT_WAITING: return {bg: 'none', fg: 'yellow'};
    case WorktreeStatusReason.UNCOMMITTED_CHANGES: return {bg: 'none', fg: 'blue'};
    case WorktreeStatusReason.UNPUSHED_COMMITS: return {bg: 'none', fg: 'cyan'};
    case WorktreeStatusReason.PR_CONFLICTS: return {bg: 'none', fg: 'red'};
    case WorktreeStatusReason.PR_FAILING: return {bg: 'none', fg: 'red'};
    case WorktreeStatusReason.PR_READY_TO_MERGE: return {bg: 'none', fg: 'green'};
    case WorktreeStatusReason.PR_CHECKING: return {bg: 'none', fg: 'magenta'};
    case WorktreeStatusReason.NO_PR: return {bg: 'none', fg: 'cyan'};
    case WorktreeStatusReason.PR_MERGED: return {bg: 'none', fg: 'gray'};
    default: return {bg: 'none', fg: 'white'};
  }
}

export function getStatusMeta(
  worktree: WorktreeInfo,
  pr: PRStatus | undefined | null
): {label: string; bg: string; fg: string} {
  const st = computeWorktreeStatus(worktree, pr);
  const reason = st.reason;
  const {bg, fg} = statusColorsFromReason(reason);
  return {label: statusLabelFromReason(reason), bg, fg};
}
