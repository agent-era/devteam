import type {WorktreeInfo} from '../models.js';

export interface RunningChip {
  label: string;
  color: string;
}

export function computeRunningChips(worktree: WorktreeInfo | null | undefined): RunningChip[] {
  const session = worktree?.session;
  if (!session) return [];
  const chips: RunningChip[] = [];
  if (session.attached) chips.push({label: 'agent', color: 'cyan'});
  if (session.shell_attached) chips.push({label: 'shell', color: 'green'});
  if (session.run_attached) chips.push({label: 'run', color: 'magenta'});
  return chips;
}
