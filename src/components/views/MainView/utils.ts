import type {WorktreeInfo} from '../../../models.js';
import {
  GIT_AHEAD,
  GIT_BEHIND,
  SYMBOL_NO_SESSION,
  SYMBOL_IDLE,
  SYMBOL_WORKING,
  SYMBOL_WAITING,
  SYMBOL_THINKING,
  SYMBOL_FAILED,
  USE_EMOJI_SYMBOLS,
  ASCII_SYMBOLS,
} from '../../../constants.js';

/**
 * Format large numbers with k suffix for display
 */
export function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

/**
 * Format diff stats (+added/-deleted) for display
 */
export function formatDiffStats(added: number, deleted: number): string {
  if (added === 0 && deleted === 0) return '-';
  return `+${formatNumber(added)}/-${formatNumber(deleted)}`;
}

/**
 * Format git changes (ahead/behind) for display
 */
export function formatGitChanges(ahead: number, behind: number): string {
  let changes = '';
  if (ahead > 0) changes += `${GIT_AHEAD}${ahead} `;
  if (behind > 0) changes += `${GIT_BEHIND}${behind}`;
  return changes || '-';
}

/**
 * Format push status indicator
 */
export function formatPushStatus(worktree: WorktreeInfo): string {
  if (!worktree.git?.has_remote) return '-';
  
  if (worktree.git.ahead === 0 && !worktree.git.has_changes) {
    return '✓'; // All changes are pushed
  }
  return '↗'; // Has unpushed commits or changes
}

/**
 * Get AI status symbol for display
 */
export function getAISymbol(claudeStatus: string, hasSession: boolean): string {
  if (!hasSession) return USE_EMOJI_SYMBOLS ? SYMBOL_NO_SESSION : ASCII_SYMBOLS.NO_SESSION;
  
  const cs = claudeStatus.toLowerCase();
  let symbol = SYMBOL_FAILED;
  
  if (cs.includes('waiting')) symbol = SYMBOL_WAITING;
  else if (cs.includes('working')) symbol = SYMBOL_WORKING;
  else if (cs.includes('thinking')) symbol = SYMBOL_THINKING;
  else if (cs.includes('idle') || cs.includes('active')) symbol = SYMBOL_IDLE;

  if (!USE_EMOJI_SYMBOLS) {
    const symbolMap: Record<string, string> = {
      [SYMBOL_NO_SESSION]: ASCII_SYMBOLS.NO_SESSION,
      [SYMBOL_WAITING]: ASCII_SYMBOLS.WAITING,
      [SYMBOL_WORKING]: ASCII_SYMBOLS.WORKING,
      [SYMBOL_THINKING]: ASCII_SYMBOLS.THINKING,
      [SYMBOL_IDLE]: ASCII_SYMBOLS.IDLE,
      [SYMBOL_FAILED]: ASCII_SYMBOLS.FAILED,
    };
    return symbolMap[symbol] || symbol;
  }

  return symbol;
}

/**
 * Format PR status for display
 */
export function formatPRStatus(pr: WorktreeInfo['pr']): string {
  if (!pr || pr.isNotChecked) return '';
  if (pr.isLoading) return '⏳';
  if (pr.noPR) return '-';
  if (pr.hasError) return '!';
  
  if (pr.exists && pr.number) {
    const badge = pr.has_conflicts ? '⚠️' 
      : pr.is_merged ? '⟫' 
      : pr.checks === 'passing' ? '✓' 
      : pr.checks === 'failing' ? '✗' 
      : pr.checks === 'pending' ? '⏳' 
      : '';
    return `#${pr.number}${badge}`;
  }
  
  return '';
}

/**
 * Check if a worktree row should be dimmed (merged PRs)
 */
export function shouldDimRow(pr: WorktreeInfo['pr']): boolean {
  return pr?.is_merged === true || pr?.state === 'MERGED';
}

/**
 * Generate stable key for worktree row
 */
export function getWorktreeKey(worktree: WorktreeInfo, index: number): string {
  // Use project/feature combination as primary key, fallback to index
  return `${worktree.project}/${worktree.feature}` || `worktree-${index}`;
}