import type {WorktreeInfo} from '../../../models.js';
import {
  GIT_AHEAD,
  GIT_BEHIND,
} from '../../../constants.js';

export function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
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

export function getAIStatusLabel(aiStatus: string, attached: boolean): string {
  if (!attached) return '';
  const s = aiStatus.toLowerCase();
  if (s.includes('waiting')) return 'waiting';
  if (s.includes('working')) return 'working';
  if (s.includes('idle') || s.includes('active')) return 'idle';
  return '';
}

export function getAIStatusColor(aiStatus: string, attached: boolean): string | undefined {
  if (!attached) return undefined;
  const s = aiStatus.toLowerCase();
  if (s.includes('waiting')) return 'yellow';
  if (s.includes('working')) return 'cyan';
  if (s.includes('idle') || s.includes('active')) return 'gray';
  return undefined;
}

export function formatPRStatus(pr: WorktreeInfo['pr']): string {
  if (!pr || pr.isNotChecked) return '';
  if (pr.isLoading) return '*';
  if (pr.noPR) return '-';
  if (pr.hasError) return '!';
  
  if (pr.exists && pr.number) {
    const badge = pr.has_conflicts ? '!' 
      : pr.is_merged ? '⟫' 
      : pr.checks === 'passing' ? '✓' 
      : pr.checks === 'failing' ? 'x' 
      : pr.checks === 'pending' ? '*' 
      : '';
    return `#${pr.number}${badge}`;
  }
  
  return '';
}

export function shouldDimRow(pr: WorktreeInfo['pr']): boolean {
  return pr?.is_merged === true || pr?.state === 'MERGED';
}

export function getWorktreeKey(worktree: WorktreeInfo, index: number): string {
  return `${worktree.project}/${worktree.feature}` || `worktree-${index}`;
}
