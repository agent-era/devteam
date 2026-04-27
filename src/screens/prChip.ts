import type {PRStatus} from '../models.js';
import {formatPRStatus} from '../components/views/MainView/utils.js';

export interface PRChip {
  label: string;
  color: string;
}

function prChipColor(pr: PRStatus): string {
  if (pr.is_merged) return 'gray';
  if (pr.has_conflicts || pr.checks === 'failing') return 'red';
  if (pr.checks === 'pending' || pr.isLoading) return 'yellow';
  if (pr.checks === 'passing') return 'green';
  return 'gray';
}

// Returns the PR chip for a worktree's PR status, or null when the chip
// shouldn't render. Suppressed only while the PR fetch is unresolved
// (`loading` / `not_checked`) or there's no PR number — merged PRs DO get
// a chip (gray, with the '⟫' badge from formatPRStatus) so the merged
// state is visible alongside the PR number, not just signalled by the
// secondary "Merged" label.
//
// PR data is passed in by the caller because WorktreeInfo.pr is never
// assigned in production — PR status lives on GitHubContext.pullRequests,
// keyed by worktree path.
export function computePRChip(pr: PRStatus | null | undefined): PRChip | null {
  if (!pr || !pr.exists || !pr.number || pr.isLoading) return null;
  const label = formatPRStatus(pr);
  if (!label) return null;
  return {label, color: prChipColor(pr)};
}
