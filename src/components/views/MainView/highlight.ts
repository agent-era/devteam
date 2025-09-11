import type {WorktreeInfo, PRStatus} from '../../../models.js';
import {computeStatusLabel as engineComputeStatusLabel} from '../../../engine/status.js';

export interface HighlightInfo {
  columnIndex: number;
  color: string;
  reason: StatusReason | string;
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
export enum StatusReason {
  CLAUDE_WAITING = 'claude-waiting',
  UNCOMMITTED_CHANGES = 'uncommitted-changes',
  UNPUSHED_COMMITS = 'unpushed-commits',
  PR_CONFLICTS = 'pr-conflicts',
  PR_FAILING = 'pr-failing',
  PR_READY_TO_MERGE = 'pr-ready-to-merge',
  PR_CHECKING = 'pr-checking',
  NO_PR = 'no-pr',
  PR_INFORMATIONAL = 'pr-informational',
  PR_MERGED = 'pr-merged',
  AGENT_READY = 'agent-ready',
}

// Determine the semantic status reason without presentation concerns
export function determineStatusReason(worktree: WorktreeInfo, pr: PRStatus | undefined | null): StatusReason | null {
  const label = engineComputeStatusLabel({
    ai_status: worktree.session?.ai_status || worktree.session?.claude_status,
    attached: worktree.session?.attached,
    has_changes: worktree.git?.has_changes,
    ahead: worktree.git?.ahead,
    behind: worktree.git?.behind,
    pr,
  } as any);
  switch (label) {
    case 'waiting': return StatusReason.CLAUDE_WAITING;
    case 'uncommitted': return StatusReason.UNCOMMITTED_CHANGES;
    case 'un-pushed': return StatusReason.UNPUSHED_COMMITS;
    case 'conflict': return StatusReason.PR_CONFLICTS;
    case 'pr-failed': return StatusReason.PR_FAILING;
    case 'pr-passed': return StatusReason.PR_READY_TO_MERGE;
    case 'pr-checking': return StatusReason.PR_CHECKING;
    case 'merged': return StatusReason.PR_MERGED;
    case 'ready': return StatusReason.AGENT_READY;
    default: return null;
  }
}

export function computeHighlightInfo(worktree: WorktreeInfo, pr: PRStatus | undefined | null): HighlightInfo | null {
  const cs = (worktree.session?.claude_status || '').toLowerCase();
  const isDimmed = pr?.is_merged === true || pr?.state === 'MERGED';
  if (cs.includes('working') || cs.includes('thinking') || isDimmed) {
    return null;
  }

  const reason = determineStatusReason(worktree, pr);
  if (!reason) return null;

  // Map reason to table column for highlighting
  const columnIndex =
    reason === StatusReason.CLAUDE_WAITING || reason === StatusReason.AGENT_READY ? COLUMNS.AI :
    reason === StatusReason.UNCOMMITTED_CHANGES ? COLUMNS.DIFF :
    reason === StatusReason.UNPUSHED_COMMITS ? COLUMNS.CHANGES :
    COLUMNS.PR;

  // Map reason to a simple severity color for highlight emphasis
  let color: string = COLORS.YELLOW;
  switch (reason) {
    case StatusReason.PR_CONFLICTS:
    case StatusReason.PR_FAILING:
      color = COLORS.RED; break;
    case StatusReason.PR_READY_TO_MERGE:
    case StatusReason.PR_MERGED:
    case StatusReason.AGENT_READY:
      color = COLORS.GREEN; break;
    default:
      color = COLORS.YELLOW; break;
  }

  return {columnIndex, color, reason};
}

export function statusLabelFromReason(reason: StatusReason | string | null | undefined): string {
  switch (reason) {
    case StatusReason.CLAUDE_WAITING:
      return 'waiting';
    case StatusReason.UNCOMMITTED_CHANGES:
      // Rename: show 'uncommitted' instead of 'modified'
      return 'uncommitted';
    case StatusReason.UNPUSHED_COMMITS:
      return 'un-pushed';
    case StatusReason.PR_CONFLICTS:
      return 'conflict';
    case StatusReason.PR_FAILING:
      return 'pr-failed';
    case StatusReason.PR_READY_TO_MERGE:
      return 'pr-passed';
    case StatusReason.PR_CHECKING:
      return 'pr-checking';
    case StatusReason.NO_PR:
      return 'no-pr';
    case StatusReason.PR_INFORMATIONAL:
      return '';
    case StatusReason.PR_MERGED:
      return 'merged';
    case StatusReason.AGENT_READY:
      return 'ready';
    default:
      return '';
  }
}

export function statusColorsFromReason(reason: StatusReason | string | null | undefined): {bg: string; fg: string} {
  // All statuses default to white text for readability
  const fg = 'white';
  switch (reason) {
    case StatusReason.CLAUDE_WAITING:
      return {bg: 'yellow', fg};
    case StatusReason.UNCOMMITTED_CHANGES:
      // Plain colored text for modified
      return {bg: 'none', fg: 'blue'};
    case StatusReason.UNPUSHED_COMMITS:
      return {bg: 'cyan', fg};
    case StatusReason.PR_CONFLICTS:
      return {bg: 'red', fg};
    case StatusReason.PR_FAILING:
      return {bg: 'red', fg};
    case StatusReason.PR_READY_TO_MERGE:
      return {bg: 'green', fg};
    case StatusReason.PR_CHECKING:
      // No background; use magenta text
      return {bg: 'none', fg: 'magenta'};
    case StatusReason.NO_PR:
      // Plain cyan text 'no-pr' with no background
      return {bg: 'none', fg: 'cyan'};
    case StatusReason.PR_INFORMATIONAL:
      return {bg: 'magenta', fg};
    case StatusReason.PR_MERGED:
      // Plain grey text 'merged' with no background
      return {bg: 'none', fg: 'gray'};
    case StatusReason.AGENT_READY:
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
  const label = engineComputeStatusLabel({
    ai_status: worktree.session?.ai_status || worktree.session?.claude_status,
    attached: worktree.session?.attached,
    has_changes: worktree.git?.has_changes,
    ahead: worktree.git?.ahead,
    behind: worktree.git?.behind,
    pr,
  } as any);
  if (label === 'working') return {label, bg: 'none', fg: 'white'};
  if (label === 'merged') return {label, bg: 'none', fg: 'gray'};
  const reason = determineStatusReason(worktree, pr);
  if (reason) {
    const {bg, fg} = statusColorsFromReason(reason);
    return {label: statusLabelFromReason(reason), bg, fg};
  }
  return {label: '', bg: 'black', fg: 'white'};
}
