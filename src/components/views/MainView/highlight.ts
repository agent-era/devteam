import type {WorktreeInfo, PRStatus} from '../../../models.js';

export interface HighlightInfo {
  columnIndex: number;
  color: string;
  reason: string;
}

export const COLUMNS = {
  NUMBER: 0,
  PROJECT_FEATURE: 1,
  AI: 2,
  DIFF: 3,
  CHANGES: 4,
  PUSHED: 5,
  PR: 6,
} as const;

export const COLORS = {
  YELLOW: 'yellow',
  RED: 'red',
  GREEN: 'green',
} as const;

export function computeHighlightInfo(worktree: WorktreeInfo, pr: PRStatus | undefined | null): HighlightInfo | null {
  const cs = (worktree.session?.claude_status || '').toLowerCase();
  const isDimmed = pr?.is_merged === true || pr?.state === 'MERGED';
  if (cs.includes('working') || cs.includes('thinking') || isDimmed) {
    return null;
  }

  if (cs.includes('waiting')) {
    return {columnIndex: COLUMNS.AI, color: COLORS.YELLOW, reason: 'claude-waiting'};
  }
  if (worktree.git?.has_changes) {
    return {columnIndex: COLUMNS.DIFF, color: COLORS.YELLOW, reason: 'unstaged-changes'};
  }
  if ((worktree.git?.ahead || 0) > 0) {
    return {columnIndex: COLUMNS.PUSHED, color: COLORS.YELLOW, reason: 'unpushed-commits'};
  }

  if (pr) {
    if (pr.has_conflicts) {
      return {columnIndex: COLUMNS.PR, color: COLORS.RED, reason: 'pr-conflicts'};
    }
    if (pr.checks === 'failing') {
      return {columnIndex: COLUMNS.PR, color: COLORS.RED, reason: 'pr-needs-attention'};
    }
    if (pr.is_ready_to_merge) {
      return {columnIndex: COLUMNS.PR, color: COLORS.GREEN, reason: 'pr-ready-to-merge'};
    }
    if (pr.is_open && pr.number) {
      return {columnIndex: COLUMNS.PR, color: COLORS.YELLOW, reason: 'pr-informational'};
    }
    if (pr.is_merged && pr.number) {
      return {columnIndex: COLUMNS.PR, color: COLORS.GREEN, reason: 'pr-merged'};
    }
    if (worktree.session?.attached && (cs.includes('idle') || cs.includes('active'))) {
      return {columnIndex: COLUMNS.AI, color: COLORS.GREEN, reason: 'claude-ready'};
    }
  }
  return null;
}

export function statusLabelFromReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'claude-waiting':
      return 'waiting';
    case 'unstaged-changes':
      return 'modified';
    case 'unpushed-commits':
      return 'un-pushed';
    case 'pr-conflicts':
      return 'conflict';
    case 'pr-needs-attention':
      return 'pr-failed';
    case 'pr-ready-to-merge':
      return 'pr-passed';
    case 'pr-informational':
      return '';
    case 'pr-merged':
      return 'merged';
    case 'claude-ready':
      return '';
    default:
      return '';
  }
}

export function statusColorsFromReason(reason: string | null | undefined): {bg: string; fg: string} {
  // All statuses default to white text for readability
  const fg = 'white';
  switch (reason) {
    case 'claude-waiting':
      return {bg: 'yellow', fg};
    case 'unstaged-changes':
      return {bg: 'blue', fg};
    case 'unpushed-commits':
      return {bg: 'cyan', fg};
    case 'pr-conflicts':
      return {bg: 'red', fg};
    case 'pr-needs-attention':
      return {bg: 'red', fg};
    case 'pr-ready-to-merge':
      return {bg: 'green', fg};
    case 'pr-informational':
      return {bg: 'magenta', fg};
    case 'pr-merged':
      return {bg: 'green', fg};
    case 'claude-ready':
      return {bg: 'green', fg};
    default:
      return {bg: 'gray', fg};
  }
}

export function getStatusMeta(
  worktree: WorktreeInfo,
  pr: PRStatus | undefined | null
): {label: string; bg: string; fg: string} {
  const hi = computeHighlightInfo(worktree, pr);
  if (hi) {
    const label = statusLabelFromReason(hi.reason);
    const {bg, fg} = statusColorsFromReason(hi.reason);
    return {label, bg, fg};
  }
  return {label: '', bg: 'black', fg: 'white'};
}
