import type {PRStatus, WorktreeInfo} from '../../../models.js';
import {
  GIT_AHEAD,
  GIT_BEHIND,
} from '../../../constants.js';

export function formatNumber(num: number): string {
  if (num >= 10000) return `${Math.floor(num / 1000)}k`;
  if (num >= 1000) return `${Math.floor(num / 100) / 10}k`;
  return num.toString();
}

export function formatDiffStats(added: number, deleted: number): string {
  if (added === 0 && deleted === 0) return '-';
  return `+${formatNumber(added)}/-${formatNumber(deleted)}`;
}

export function formatGitChanges(ahead: number, behind: number): string {
  let changes = '';
  if (ahead > 0) changes += `${GIT_AHEAD}${ahead} `;
  if (behind > 0) changes += `${GIT_BEHIND}${behind}`;
  return changes || '-';
}

export function formatPushStatus(worktree: WorktreeInfo): string {
  if (!worktree.git?.has_remote) return '-';
  
  if (worktree.git.ahead === 0 && !worktree.git.has_changes) {
    return '✓';
  }
  return 'x';
}


// Single-char badge that suffixes a PR number to convey state at a glance.
// Shared between the mainview PR column and the tracker board's PR chip so
// state-glyph mapping can't drift between the two surfaces.
export function prBadge(pr: PRStatus): string {
  if (pr.has_conflicts) return '!';
  if (pr.is_merged) return '⟫';
  if (pr.checks === 'passing') return '✓';
  if (pr.checks === 'failing') return 'x';
  if (pr.checks === 'pending') return '*';
  return '';
}

export function formatPRStatus(pr: PRStatus | undefined | null): string {
  if (!pr || pr.isNotChecked) return '';
  if (pr.isLoading) return '*';
  if (pr.noPR) return '-';
  if (pr.hasError) return '!';
  if (pr.exists && pr.number) return `#${pr.number}${prBadge(pr)}`;
  return '';
}

export function shouldDimRow(pr: PRStatus | undefined | null): boolean {
  return pr?.is_merged === true || pr?.state === 'MERGED';
}

export function getWorktreeKey(worktree: WorktreeInfo, index: number): string {
  return `${worktree.project}/${worktree.feature}` || `worktree-${index}`;
}
