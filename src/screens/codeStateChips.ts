import type {PRStatus, WorktreeInfo} from '../models.js';
import {formatDiffStats, formatGitChanges, formatPRStatus} from '../components/views/MainView/utils.js';

export interface CodeStateChip {
  label: string;
  color: string;
}

// Background colors mirror mainview's priority-cell highlights so the same
// signal reads the same way in both views (blue = uncommitted/diff bulk,
// cyan = unpushed commits).
const DIFF_COLOR = 'blue';
const CHANGES_COLOR = 'cyan';

function prChipColor(pr: PRStatus): string {
  if (pr.has_conflicts || pr.checks === 'failing') return 'red';
  if (pr.checks === 'pending' || pr.isLoading) return 'yellow';
  if (pr.checks === 'passing') return 'green';
  return 'gray';
}

// Produces up to three "code state" chips for a tracker-board card: diff
// bulk (excluding tracker-tooling churn), commits ahead/behind base, and PR
// number + check badge. Each chip is omitted when its underlying value is
// quiet (zero diff, no divergent commits, no live PR), so the row stays
// invisible for clean worktrees.
//
// PR data is passed separately because WorktreeInfo.pr is never assigned in
// production — PR status lives on GitHubContext.pullRequests, keyed by
// worktree path. Callers should look it up there.
export function computeCodeStateChips(
  worktree: WorktreeInfo | null | undefined,
  pr?: PRStatus | null,
): CodeStateChip[] {
  if (!worktree) return [];
  const chips: CodeStateChip[] = [];

  const git = worktree.git;
  if (git) {
    const added = git.base_added_lines_excl_tracker || 0;
    const deleted = git.base_deleted_lines_excl_tracker || 0;
    if (added + deleted > 0) {
      chips.push({label: formatDiffStats(added, deleted), color: DIFF_COLOR});
    }
    if ((git.ahead || 0) > 0 || (git.behind || 0) > 0) {
      chips.push({label: formatGitChanges(git.ahead || 0, git.behind || 0), color: CHANGES_COLOR});
    }
  }

  // Suppress while the PR check is mid-flight or unresolved — formatPRStatus
  // would emit '*' or '' and the chip would be misleading. Merged PRs use the
  // gray "Merged" secondary text on the card itself, so the chip stays off.
  if (pr && pr.exists && pr.number && !pr.is_merged && !pr.isLoading) {
    const label = formatPRStatus(pr);
    if (label) chips.push({label, color: prChipColor(pr)});
  }

  return chips;
}
