import type { WorktreeInfo, PRStatus } from '../models.js';

// Logical aspect of a status — not tied to presentation
export type StatusAspect = 'agent' | 'diff' | 'sync' | 'pr' | 'none';

// Canonical reasons for worktree status (logic only)
export enum WorktreeStatusReason {
  AGENT_WAITING = 'agent-waiting',
  AGENT_WORKING = 'agent-working',
  AGENT_READY = 'agent-ready',
  UNCOMMITTED_CHANGES = 'uncommitted-changes',
  UNPUSHED_COMMITS = 'unpushed-commits',
  PR_CONFLICTS = 'pr-conflicts',
  PR_FAILING = 'pr-failing',
  PR_READY_TO_MERGE = 'pr-ready-to-merge',
  PR_CHECKING = 'pr-checking',
  NO_PR = 'no-pr',
  PR_MERGED = 'pr-merged',
  NONE = 'none',
}

export type Severity = 'error' | 'warn' | 'success' | 'info' | 'none';

export type WorktreeStatus = {
  reason: WorktreeStatusReason;
  severity: Severity;
  aspect: StatusAspect;
};

function hasCommittedBaseDiff(w: WorktreeInfo): boolean {
  const added = Number(w?.git?.base_added_lines || 0);
  const deleted = Number(w?.git?.base_deleted_lines || 0);
  return (added + deleted) > 0;
}

function aiString(w: WorktreeInfo): string {
  return String(w?.session?.ai_status || (w as any)?.session?.claude_status || '').toLowerCase();
}

export function computeWorktreeStatus(w: WorktreeInfo, pr?: PRStatus | null): WorktreeStatus {
  const ai = aiString(w);
  const attached = !!w?.session?.attached;

  // Highest-priority terminal states
  if (pr && (pr.is_merged || pr.state === 'MERGED')) {
    return { reason: WorktreeStatusReason.PR_MERGED, severity: 'info', aspect: 'pr' };
  }

  // AI states
  if (attached && (ai.includes('working') || ai.includes('thinking'))) {
    return { reason: WorktreeStatusReason.AGENT_WORKING, severity: 'info', aspect: 'agent' };
  }
  if (attached && ai.includes('waiting')) {
    return { reason: WorktreeStatusReason.AGENT_WAITING, severity: 'warn', aspect: 'agent' };
  }

  // PR state (evaluate before local git so `no pr` takes precedence over uncommitted base diff)
  if (pr) {
    if (pr.has_conflicts) {
      return { reason: WorktreeStatusReason.PR_CONFLICTS, severity: 'error', aspect: 'pr' };
    }
    if (pr.checks === 'failing') {
      return { reason: WorktreeStatusReason.PR_FAILING, severity: 'error', aspect: 'pr' };
    }
    if (pr.is_ready_to_merge) {
      return { reason: WorktreeStatusReason.PR_READY_TO_MERGE, severity: 'success', aspect: 'pr' };
    }
    if (pr.is_open && pr.number && pr.checks === 'pending') {
      return { reason: WorktreeStatusReason.PR_CHECKING, severity: 'warn', aspect: 'pr' };
    }
    if (pr.noPR) {
      const remote = !!w?.git?.has_remote;
      if (remote && hasCommittedBaseDiff(w)) {
        return { reason: WorktreeStatusReason.NO_PR, severity: 'info', aspect: 'pr' };
      }
      // No PR and nothing committed yet — fall through to agent ready if applicable
    }
    if (pr.is_open && pr.number) {
      // Open PR with no explicit checks state — treat as ready to merge by default
      return { reason: WorktreeStatusReason.PR_READY_TO_MERGE, severity: 'success', aspect: 'pr' };
    }
  }

  // Local git state (after PR checks)
  if (hasCommittedBaseDiff(w)) {
    return { reason: WorktreeStatusReason.UNCOMMITTED_CHANGES, severity: 'info', aspect: 'diff' };
  }
  if (Number(w?.git?.ahead || 0) > 0) {
    return { reason: WorktreeStatusReason.UNPUSHED_COMMITS, severity: 'info', aspect: 'sync' };
  }

  // Agent idle/active when attached → ready
  if (attached && (ai.includes('idle') || ai.includes('active'))) {
    return { reason: WorktreeStatusReason.AGENT_READY, severity: 'success', aspect: 'agent' };
  }

  return { reason: WorktreeStatusReason.NONE, severity: 'none', aspect: 'none' };
}

export function computeAIWorktreeStatus(w: WorktreeInfo): WorktreeStatus {
  const ai = aiString(w);
  const attached = !!w?.session?.attached;
  if (!attached) return { reason: WorktreeStatusReason.NONE, severity: 'none', aspect: 'none' };
  if (ai.includes('waiting')) return { reason: WorktreeStatusReason.AGENT_WAITING, severity: 'warn', aspect: 'agent' };
  if (ai.includes('working') || ai.includes('thinking')) return { reason: WorktreeStatusReason.AGENT_WORKING, severity: 'info', aspect: 'agent' };
  if (ai.includes('idle') || ai.includes('active')) return { reason: WorktreeStatusReason.AGENT_READY, severity: 'success', aspect: 'agent' };
  return { reason: WorktreeStatusReason.NONE, severity: 'none', aspect: 'none' };
}
