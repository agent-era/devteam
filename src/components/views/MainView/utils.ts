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
  return '↗';
}

export function getAISymbol(aiStatus: string, hasSession: boolean, aiTool?: string): string {
  // Get the base symbol
  let baseSymbol: string;
  
  if (!hasSession) {
    baseSymbol = USE_EMOJI_SYMBOLS ? SYMBOL_NO_SESSION : ASCII_SYMBOLS.NO_SESSION;
  } else {
    const status = aiStatus.toLowerCase();
    let symbol = SYMBOL_FAILED;
    
    if (status.includes('waiting')) symbol = SYMBOL_WAITING;
    else if (status.includes('working')) symbol = SYMBOL_WORKING;
    else if (status.includes('thinking')) symbol = SYMBOL_THINKING;
    else if (status.includes('idle') || status.includes('active')) symbol = SYMBOL_IDLE;

    if (!USE_EMOJI_SYMBOLS) {
      const symbolMap: Record<string, string> = {
        [SYMBOL_NO_SESSION]: ASCII_SYMBOLS.NO_SESSION,
        [SYMBOL_WAITING]: ASCII_SYMBOLS.WAITING,
        [SYMBOL_WORKING]: ASCII_SYMBOLS.WORKING,
        [SYMBOL_THINKING]: ASCII_SYMBOLS.THINKING,
        [SYMBOL_IDLE]: ASCII_SYMBOLS.IDLE,
        [SYMBOL_FAILED]: ASCII_SYMBOLS.FAILED,
      };
      baseSymbol = symbolMap[symbol] || symbol;
    } else {
      baseSymbol = symbol;
    }
  }
  
  // Add AI tool indicator
  if (hasSession && aiTool && aiTool !== 'none') {
    const toolIndicators: Record<string, string> = {
      'claude': '[C]',
      'codex': '[X]', 
      'gemini': '[G]'
    };
    const indicator = toolIndicators[aiTool] || '[?]';
    return `${baseSymbol}${indicator}`;
  }
  
  return baseSymbol;
}

// Backward compatibility function
export function getClaudeSymbol(claudeStatus: string, hasSession: boolean): string {
  return getAISymbol(claudeStatus, hasSession, 'claude');
}

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

export function shouldDimRow(pr: WorktreeInfo['pr']): boolean {
  return pr?.is_merged === true || pr?.state === 'MERGED';
}

export function getWorktreeKey(worktree: WorktreeInfo, index: number): string {
  return `${worktree.project}/${worktree.feature}` || `worktree-${index}`;
}