import {describe, test, expect} from '@jest/globals';
import {computeCodeStateChips} from '../../src/screens/codeStateChips.js';
import {GitStatus, PRStatus, WorktreeInfo} from '../../src/models.js';

function wt(git?: Partial<GitStatus>): WorktreeInfo {
  return new WorktreeInfo({
    project: 'p',
    feature: 'f',
    path: '/p/f',
    git: new GitStatus(git),
  });
}

function pr(init: Partial<PRStatus>): PRStatus {
  return new PRStatus(init);
}

describe('computeCodeStateChips', () => {
  test('null worktree → []', () => {
    expect(computeCodeStateChips(null)).toEqual([]);
  });

  test('undefined worktree → []', () => {
    expect(computeCodeStateChips(undefined)).toEqual([]);
  });

  test('clean worktree (no diff, no commits, no PR) → []', () => {
    expect(computeCodeStateChips(wt())).toEqual([]);
  });

  test('only excluded-tracker diff present → only diff chip', () => {
    const chips = computeCodeStateChips(wt({base_added_lines_excl_tracker: 12, base_deleted_lines_excl_tracker: 3}));
    expect(chips).toEqual([{label: '+12/-3', color: 'blue'}]);
  });

  test('diff chip ignores full base counts when excl_tracker is zero', () => {
    // Only tracker md churn → full counts are nonzero, excl_tracker is zero → no chip.
    const chips = computeCodeStateChips(wt({base_added_lines: 50, base_deleted_lines: 5}));
    expect(chips).toEqual([]);
  });

  test('only ahead → only changes chip', () => {
    const chips = computeCodeStateChips(wt({ahead: 3}));
    expect(chips).toEqual([{label: '↑3 ', color: 'cyan'}]);
  });

  test('only behind → only changes chip', () => {
    const chips = computeCodeStateChips(wt({behind: 2}));
    expect(chips).toEqual([{label: '↓2', color: 'cyan'}]);
  });

  test('PR open + passing → green chip', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'exists', number: 42, state: 'OPEN', checks: 'passing', mergeable: 'MERGEABLE'}));
    expect(chips).toEqual([{label: '#42✓', color: 'green'}]);
  });

  test('PR with failing checks → red chip', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'exists', number: 99, state: 'OPEN', checks: 'failing'}));
    expect(chips).toEqual([{label: '#99x', color: 'red'}]);
  });

  test('PR with conflicts → red chip', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'exists', number: 7, state: 'OPEN', checks: 'passing', mergeable: 'CONFLICTING'}));
    expect(chips[0]).toMatchObject({color: 'red'});
  });

  test('PR pending checks → yellow chip', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'exists', number: 8, state: 'OPEN', checks: 'pending'}));
    expect(chips).toEqual([{label: '#8*', color: 'yellow'}]);
  });

  test('PR merged → gray chip with merged badge', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'exists', number: 5, state: 'MERGED', checks: 'passing'}));
    expect(chips).toEqual([{label: '#5⟫', color: 'gray'}]);
  });

  test('PR loading → no PR chip', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'loading', number: 1}));
    expect(chips).toEqual([]);
  });

  test('PR not yet checked → no PR chip', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'not_checked'}));
    expect(chips).toEqual([]);
  });

  test('PR omitted (undefined) → no PR chip', () => {
    const chips = computeCodeStateChips(wt({ahead: 1}));
    expect(chips).toEqual([{label: '↑1 ', color: 'cyan'}]);
  });

  test('all three signals → diff, changes, PR in fixed order', () => {
    const chips = computeCodeStateChips(
      wt({base_added_lines_excl_tracker: 100, base_deleted_lines_excl_tracker: 20, ahead: 1, behind: 0}),
      pr({loadingStatus: 'exists', number: 11, state: 'OPEN', checks: 'passing', mergeable: 'MERGEABLE'}),
    );
    expect(chips).toEqual([
      {label: '+100/-20', color: 'blue'},
      {label: '↑1 ', color: 'cyan'},
      {label: '#11✓', color: 'green'},
    ]);
  });
});
