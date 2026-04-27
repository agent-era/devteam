import type {AIStatus, PRStatus, WorktreeInfo} from '../../models.js';

// Reads from GitHubContext (keyed by path), not wt.pr — which is never assigned in prod.
export function isItemPRMerged(
  worktree: WorktreeInfo | null,
  pullRequests: Record<string, PRStatus>,
): boolean {
  if (!worktree) return false;
  return pullRequests[worktree.path]?.is_merged === true;
}

// Live tmux AI status takes precedence over file-based status.json signals so
// a stale `waiting_for_input` / `waiting_for_approval` doesn't paint an
// actively running agent yellow or green, and a real consent gate
// (`aiStatus === 'waiting'`) doesn't get hidden behind a stale "ready"
// state. `freshWaiting` / `freshReady` come from
// `TrackerService.isItemWaiting` / `isItemReadyToAdvance` (already
// staleness-filtered).
export function computeCardStatusFlags({
  aiStatus,
  prMerged,
  freshWaiting,
  freshReady,
}: {
  aiStatus: AIStatus | undefined;
  prMerged: boolean;
  freshWaiting: boolean;
  freshReady: boolean;
}): {
  readyToAdvance: boolean;
  isWaiting: boolean;
  isWorking: boolean;
  hasSession: boolean;
} {
  const aiWaiting = aiStatus === 'waiting';
  const isWorking = aiStatus === 'working' || aiStatus === 'active';
  const hasSession = !!aiStatus && aiStatus !== 'not_running';

  const readyToAdvance = !prMerged && !isWorking && !aiWaiting && freshReady;
  const ralphWaiting = !isWorking && !aiWaiting && !readyToAdvance && freshWaiting;
  const isWaiting = aiWaiting || ralphWaiting;

  return {readyToAdvance, isWaiting, isWorking, hasSession};
}
