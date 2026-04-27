import type {PRStatus, WorktreeInfo} from '../models.js';
import {formatDiffStats, formatGitChanges, formatPRStatus} from '../components/views/MainView/utils.js';

export interface CodeStateChip {
  label: string;
  color: string;
  // When true, render as plain colored text (no background pill). Diff and
  // changes are decorative-quiet — the agent/shell/run row plus the PR chip
  // already carry enough background weight on a card; another two filled
  // pills makes the row read like a badge dump. The PR chip stays as a
  // filled pill since it's the most "actionable" data point in the row.
  plain: boolean;
}

// Diff/changes get their semantic color (blue/cyan, mirroring mainview's
// priority-cell highlights) only when there's actionable pending work
// (uncommitted modifications or unpushed commits). When everything is
// committed+pushed they fade to gray so the eye isn't drawn to a clean
// state. PR chip has its own color logic.
const DIFF_COLOR = 'blue';
const CHANGES_COLOR = 'cyan';
const QUIET_COLOR = 'gray';

function prChipColor(pr: PRStatus): string {
  if (pr.is_merged) return 'gray';
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
    // is_pushed already requires !has_changes && upstreamAhead === 0, so
    // it's the single signal for "everything safely on the remote".
    const pending = !git.is_pushed;
    const added = git.base_added_lines_excl_tracker || 0;
    const deleted = git.base_deleted_lines_excl_tracker || 0;
    if (added + deleted > 0) {
      chips.push({label: formatDiffStats(added, deleted), color: pending ? DIFF_COLOR : QUIET_COLOR, plain: true});
    }
    if ((git.ahead || 0) > 0 || (git.behind || 0) > 0) {
      chips.push({label: formatGitChanges(git.ahead || 0, git.behind || 0), color: pending ? CHANGES_COLOR : QUIET_COLOR, plain: true});
    }
  }

  // Suppress while the PR check is mid-flight or unresolved — formatPRStatus
  // would emit '*' or '' and the chip would be misleading. Merged PRs DO get
  // a chip (gray, with the '⟫' badge from formatPRStatus) so the merged state
  // is visible alongside the PR number, not just signalled by the secondary
  // "Merged" label.
  if (pr && pr.exists && pr.number && !pr.isLoading) {
    const label = formatPRStatus(pr);
    if (label) chips.push({label, color: prChipColor(pr), plain: false});
  }

  return chips;
}
