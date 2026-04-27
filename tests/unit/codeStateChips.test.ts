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

  test('only excluded-tracker diff present, work pending → blue plain chip', () => {
    const chips = computeCodeStateChips(wt({base_added_lines_excl_tracker: 12, base_deleted_lines_excl_tracker: 3}));
    expect(chips).toEqual([{label: '+12/-3', color: 'blue', plain: true}]);
  });

  test('committed + pushed → diff chip stays gray (quiet)', () => {
    const chips = computeCodeStateChips(wt({
      base_added_lines_excl_tracker: 12,
      base_deleted_lines_excl_tracker: 3,
      is_pushed: true,
    }));
    expect(chips).toEqual([{label: '+12/-3', color: 'gray', plain: true}]);
  });

  test('diff chip ignores full base counts when excl_tracker is zero', () => {
    // Only tracker md churn → full counts are nonzero, excl_tracker is zero → no chip.
    const chips = computeCodeStateChips(wt({base_added_lines: 50, base_deleted_lines: 5}));
    expect(chips).toEqual([]);
  });

  test('only ahead, work pending → cyan plain chip', () => {
    const chips = computeCodeStateChips(wt({ahead: 3}));
    expect(chips).toEqual([{label: '↑3 ', color: 'cyan', plain: true}]);
  });

  test('only behind → cyan plain chip (also pending: no remote)', () => {
    const chips = computeCodeStateChips(wt({behind: 2}));
    expect(chips).toEqual([{label: '↓2', color: 'cyan', plain: true}]);
  });

  test('changes chip stays gray when committed + pushed', () => {
    const chips = computeCodeStateChips(wt({ahead: 5, is_pushed: true}));
    expect(chips).toEqual([{label: '↑5 ', color: 'gray', plain: true}]);
  });

  test('PR open + passing → green filled chip', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'exists', number: 42, state: 'OPEN', checks: 'passing', mergeable: 'MERGEABLE'}));
    expect(chips).toEqual([{label: '#42✓', color: 'green', plain: false}]);
  });

  test('PR with failing checks → red filled chip', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'exists', number: 99, state: 'OPEN', checks: 'failing'}));
    expect(chips).toEqual([{label: '#99x', color: 'red', plain: false}]);
  });

  test('PR with conflicts → red filled chip', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'exists', number: 7, state: 'OPEN', checks: 'passing', mergeable: 'CONFLICTING'}));
    expect(chips[0]).toMatchObject({color: 'red', plain: false});
  });

  test('PR pending checks → yellow filled chip', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'exists', number: 8, state: 'OPEN', checks: 'pending'}));
    expect(chips).toEqual([{label: '#8*', color: 'yellow', plain: false}]);
  });

  test('PR merged → gray filled chip with merged badge', () => {
    const chips = computeCodeStateChips(wt(), pr({loadingStatus: 'exists', number: 5, state: 'MERGED', checks: 'passing'}));
    expect(chips).toEqual([{label: '#5⟫', color: 'gray', plain: false}]);
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
    expect(chips).toEqual([{label: '↑1 ', color: 'cyan', plain: true}]);
  });

  test('all three signals (pending) → diff blue, changes cyan, PR green; PR is the only filled pill', () => {
    const chips = computeCodeStateChips(
      wt({base_added_lines_excl_tracker: 100, base_deleted_lines_excl_tracker: 20, ahead: 1, behind: 0}),
      pr({loadingStatus: 'exists', number: 11, state: 'OPEN', checks: 'passing', mergeable: 'MERGEABLE'}),
    );
    expect(chips).toEqual([
      {label: '+100/-20', color: 'blue', plain: true},
      {label: '↑1 ', color: 'cyan', plain: true},
      {label: '#11✓', color: 'green', plain: false},
    ]);
  });
});
