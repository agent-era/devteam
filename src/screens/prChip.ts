import type {PRStatus} from '../models.js';
import {prBadge} from '../components/views/MainView/utils.js';

export interface PRChip {
  label: string;
  color: string;
}

function prChipColor(pr: PRStatus): string {
  if (pr.is_merged) return 'gray';
  if (pr.has_conflicts || pr.checks === 'failing') return 'red';
  if (pr.checks === 'pending') return 'yellow';
  if (pr.checks === 'passing') return 'green';
  return 'gray';
}

// Returns null while the PR fetch is unresolved or there's no PR number to show.
// Caller decides how to render (e.g. gray-out for merged/inactive cards).
export function computePRChip(pr: PRStatus | null | undefined): PRChip | null {
  if (!pr || !pr.exists || !pr.number) return null;
  return {label: `PR ${pr.number}${prBadge(pr)}`, color: prChipColor(pr)};
}
