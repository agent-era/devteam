import {describe, test, expect} from '@jest/globals';
import {computeRunningChips} from '../../src/screens/runningChips.js';
import {WorktreeInfo, SessionInfo} from '../../src/models.js';

function wt(session: Partial<SessionInfo>): WorktreeInfo {
  return new WorktreeInfo({
    project: 'p',
    feature: 'f',
    path: '/p/f',
    session: new SessionInfo({session_name: 's', ai_status: 'idle', ai_tool: 'none', ...session}),
  });
}

describe('computeRunningChips', () => {
  test('all three flags active → agent, shell, run in fixed order', () => {
    const chips = computeRunningChips(wt({attached: true, shell_attached: true, run_attached: true}));
    expect(chips).toEqual([
      {label: 'agent', color: 'cyan'},
      {label: 'shell', color: 'green'},
      {label: 'run', color: 'magenta'},
    ]);
  });

  test('only shell_attached → only shell chip', () => {
    const chips = computeRunningChips(wt({attached: false, shell_attached: true, run_attached: false}));
    expect(chips).toEqual([{label: 'shell', color: 'green'}]);
  });

  test('only attached (agent) → only agent chip', () => {
    const chips = computeRunningChips(wt({attached: true, shell_attached: false, run_attached: false}));
    expect(chips).toEqual([{label: 'agent', color: 'cyan'}]);
  });

  test('only run_attached → only run chip', () => {
    const chips = computeRunningChips(wt({attached: false, shell_attached: false, run_attached: true}));
    expect(chips).toEqual([{label: 'run', color: 'magenta'}]);
  });

  test('agent + run (no shell) preserves fixed order with shell skipped', () => {
    const chips = computeRunningChips(wt({attached: true, shell_attached: false, run_attached: true}));
    expect(chips).toEqual([
      {label: 'agent', color: 'cyan'},
      {label: 'run', color: 'magenta'},
    ]);
  });

  test('worktree linked but no sessions running → []', () => {
    const chips = computeRunningChips(wt({attached: false, shell_attached: false, run_attached: false}));
    expect(chips).toEqual([]);
  });

  test('null worktree (no link) → []', () => {
    expect(computeRunningChips(null)).toEqual([]);
  });

  test('undefined worktree → []', () => {
    expect(computeRunningChips(undefined)).toEqual([]);
  });

  test('worktree with no session → []', () => {
    const w = new WorktreeInfo({project: 'p', feature: 'f', path: '/p/f'});
    (w as any).session = undefined;
    expect(computeRunningChips(w)).toEqual([]);
  });
});
