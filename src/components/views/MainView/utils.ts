import type {WorktreeInfo} from '../../../models.js';
import {
  GIT_AHEAD,
  GIT_BEHIND,
  SYMBOL_NO_SESSION,
  SYMBOL_IDLE,
  SYMBOL_WORKING,
  SYMBOL_WAITING,
  SYMBOL_FAILED,
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

export function getAISymbol(aiStatus: string, hasSession: boolean): string {
  if (!hasSession) return SYMBOL_NO_SESSION;

  const status = aiStatus.toLowerCase();
  if (status.includes('waiting')) return SYMBOL_WAITING;
  if (status.includes('working')) return SYMBOL_WORKING;
  if (status.includes('idle') || status.includes('active')) return SYMBOL_IDLE;
  return SYMBOL_FAILED;
}

// Backward compatibility function
export function getClaudeSymbol(claudeStatus: string, hasSession: boolean): string {
  return getAISymbol(claudeStatus, hasSession);
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
