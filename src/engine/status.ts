import type {AIStatus} from '../models.js';
import type {WorktreeInfo, PRStatus} from '../models.js';

export type MinimalStatusFields = {
  ai_status?: AIStatus | string;
  attached?: boolean;
  has_changes?: boolean;
  ahead?: number;
  behind?: number;
  pr?: Partial<{
    number: number | null;
    state: string | null; // OPEN, MERGED, CLOSED
    checks: string | null; // passing, failing, pending
    mergeable: string | null; // MERGEABLE, CONFLICTING, UNKNOWN
    has_conflicts: boolean;
    is_ready_to_merge: boolean;
    is_open: boolean;
    is_merged: boolean;
    noPR: boolean;
  }> | null;
};

function coerceBool(v: any): boolean { return !!v; }
function lower(v?: string | null): string { return (v || '').toString().toLowerCase(); }

export function computeStatusLabel(input: MinimalStatusFields | (WorktreeInfo | (WorktreeInfo & {pr?: PRStatus | null} ))): string {
  // Normalize fields from either Minimal or WorktreeInfo
  const ai_status = (input as any).ai_status ?? (input as any).session?.ai_status ?? 'not_running';
  const attached = (input as any).attached ?? coerceBool((input as any).session?.attached);
  const git = (input as any).git ?? {};
  const has_changes = (input as any).has_changes ?? coerceBool(git?.has_changes);
  const ahead = (input as any).ahead ?? Number(git?.ahead || 0);
  const behind = (input as any).behind ?? Number(git?.behind || 0);
  const prIn: any = (input as any).pr ?? (input as any).pr;

  const ai = lower(ai_status);

  // Highest priority: active AI work or dimmed states
  if (attached && (ai.includes('working') || ai.includes('thinking'))) return 'working';
  if (attached && ai.includes('waiting')) return 'waiting';

  // PR-based logic when available
  if (prIn) {
    const hasConflicts = coerceBool(prIn.has_conflicts) || prIn.mergeable === 'CONFLICTING';
    if (hasConflicts) return 'conflict';
    const checks = lower(prIn.checks);
    if (checks === 'failing') return 'pr-failed';
    const isReadyToMerge = coerceBool(prIn.is_ready_to_merge) || (prIn.state === 'OPEN' && prIn.mergeable === 'MERGEABLE' && checks === 'passing');
    if (isReadyToMerge) return 'pr-passed';
    const isOpen = coerceBool(prIn.is_open) || prIn.state === 'OPEN';
    const hasNumber = prIn.number != null && prIn.number !== undefined;
    if (isOpen && hasNumber && (checks === 'pending' || !checks)) return 'pr-checking';
    const isMerged = coerceBool(prIn.is_merged) || prIn.state === 'MERGED';
    if (isMerged && hasNumber) return 'merged';
    if (coerceBool(prIn.noPR)) {
      // Without remote/base info (committed diff with remote), skip no-pr to avoid false positives.
    }
  }

  // Local git signals
  if (has_changes) return 'uncommitted';
  if (Number(ahead) > 0) return 'un-pushed';

  // Ready when attached but idle/active
  if (attached && (ai.includes('idle') || ai.includes('active'))) return 'ready';

  return '';
}

