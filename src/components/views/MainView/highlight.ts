import type {WorktreeInfo, PRStatus} from '../../../models.js';

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
  AGENT_WAITING = 'agent-waiting',
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
  const cs = (worktree.session?.claude_status || '').toLowerCase();
  if (cs.includes('waiting')) return StatusReason.AGENT_WAITING;
  if (worktree.git?.has_changes) return StatusReason.UNCOMMITTED_CHANGES;
  if ((worktree.git?.ahead || 0) > 0) return StatusReason.UNPUSHED_COMMITS;

  if (pr) {
    if (pr.has_conflicts) return StatusReason.PR_CONFLICTS;
    if (pr.checks === 'failing') return StatusReason.PR_FAILING;
    if (pr.is_ready_to_merge) return StatusReason.PR_READY_TO_MERGE;
    // Explicit pending checks
    if (pr.is_open && pr.number && pr.checks === 'pending') return StatusReason.PR_CHECKING;
    if (pr.noPR) {
      const hasCommittedBaseDiff = ((worktree.git?.base_added_lines ?? 0) + (worktree.git?.base_deleted_lines ?? 0)) > 0;
      if (worktree.git?.has_remote && hasCommittedBaseDiff) return StatusReason.NO_PR;
      return StatusReason.AGENT_READY;
    }
    if (pr.is_open && pr.number) {
      // Open PR with no explicit checks state: treat as ready to merge
      return StatusReason.PR_READY_TO_MERGE;
    }
    if (pr.is_merged && pr.number) return StatusReason.PR_MERGED;
    if (worktree.session?.attached && (cs.includes('idle') || cs.includes('active'))) return StatusReason.AGENT_READY;
  }
  return null;
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
    reason === StatusReason.AGENT_WAITING || reason === StatusReason.AGENT_READY ? COLUMNS.AI :
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
    case StatusReason.AGENT_WAITING:
      return 'waiting';
    case StatusReason.UNCOMMITTED_CHANGES:
      // Rename: show 'uncommitted' instead of 'modified'
      return 'uncommitted';
    case StatusReason.UNPUSHED_COMMITS:
      return 'not pushed';
    case StatusReason.PR_CONFLICTS:
      return 'conflict';
    case StatusReason.PR_FAILING:
      return 'pr failed';
    case StatusReason.PR_READY_TO_MERGE:
      return 'pr ready';
    case StatusReason.PR_CHECKING:
      return 'checking pr';
    case StatusReason.NO_PR:
      return 'no pr';
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
    case StatusReason.AGENT_WAITING:
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
      // Plain cyan text 'no pr' with no background
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
  const hi = computeHighlightInfo(worktree, pr);
  if (hi) {
    const label = statusLabelFromReason(hi.reason);
    const {bg, fg} = statusColorsFromReason(hi.reason);
    return {label, bg, fg};
  }
  // If AI is working, show plain text label with no highlight
  const ai = (worktree.session?.ai_status || worktree.session?.claude_status || '').toLowerCase();
  if (ai.includes('working')) {
    return {label: 'working', bg: 'none', fg: 'white'};
  }
  // If PR is merged, show plain grey 'merged' with no background
  if (pr && (pr.is_merged || pr.state === 'MERGED')) {
    return {label: 'merged', bg: 'none', fg: 'gray'};
  }
  return {label: '', bg: 'black', fg: 'white'};
}

// AI-only status meta, useful for rows that should reflect just agent state (e.g., workspace headers)
export function getAIStatusMeta(
  worktree: WorktreeInfo,
): {label: string; bg: string; fg: string} {
  const ai = (worktree.session?.ai_status || worktree.session?.claude_status || '').toLowerCase();
  if (ai.includes('waiting')) {
    const {bg, fg} = statusColorsFromReason(StatusReason.AGENT_WAITING);
    return {label: 'waiting', bg, fg};
  }
  if (ai.includes('working')) {
    return {label: 'working', bg: 'none', fg: 'white'};
  }
  if (worktree.session?.attached && (ai.includes('idle') || ai.includes('active'))) {
    const {bg, fg} = statusColorsFromReason(StatusReason.AGENT_READY);
    return {label: 'ready', bg, fg};
  }
  return {label: '', bg: 'black', fg: 'white'};
}
