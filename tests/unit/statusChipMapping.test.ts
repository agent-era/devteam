import {describe, test, expect} from '@jest/globals';
import {getStatusMeta} from '../../src/components/views/MainView/highlight.js';
import {PRStatus, WorktreeInfo, SessionInfo} from '../../src/models.js';

function wt(init?: Partial<WorktreeInfo>): WorktreeInfo {
  return new WorktreeInfo({
    project: 'proj',
    feature: 'feat',
    path: '/proj/feat',
    git: {has_remote: true, ahead: 0, behind: 0, is_pushed: true, has_changes: false, base_added_lines: 0, base_deleted_lines: 0, added_lines: 0, deleted_lines: 0, modified_files: 0, untracked_lines: 0},
    session: new SessionInfo({attached: true, session_name: 's', ai_status: 'idle', ai_tool: 'none'}),
    ...init,
  });
}

describe('STATUS chip mapping', () => {
  test('PR checking => plain magenta pr checking', () => {
    const worktree = wt();
    const pr = new PRStatus({loadingStatus: 'exists', number: 12, state: 'OPEN', checks: 'pending'});
    const meta = getStatusMeta(worktree, pr);
    expect(meta.label).toBe('pr checking');
    expect(meta.bg).toBe('none');
    expect(meta.fg).toBe('magenta');
  });

  test('AI working => plain working, no bg', () => {
    const worktree = wt({session: new SessionInfo({attached: true, session_name: 's', ai_status: 'working', ai_tool: 'none'})});
    const pr = undefined;
    const meta = getStatusMeta(worktree, pr as any);
    expect(meta.label).toBe('working');
    expect(meta.bg).toBe('none');
  });

  test('PR merged => plain grey merged, no bg', () => {
    const worktree = wt();
    const pr = new PRStatus({loadingStatus: 'exists', number: 5, state: 'MERGED'});
    const meta = getStatusMeta(worktree, pr);
    expect(meta.label).toBe('merged');
    expect(meta.bg).toBe('none');
    expect(meta.fg).toBe('gray');
  });

  test('No PR and pushed with committed changes => plain cyan no pr (no bg)', () => {
    const baseGit = wt().git;
    const worktree = wt({git: {...baseGit, has_remote: true, ahead: 0, is_pushed: true, base_added_lines: 10, base_deleted_lines: 2}});
    const pr = new PRStatus({loadingStatus: 'no_pr'});
    const meta = getStatusMeta(worktree, pr);
    expect(meta.label).toBe('no pr');
    expect(meta.bg).toBe('none');
    expect(meta.fg).toBe('cyan');
  });

  test('No PR and no base diff => ready', () => {
    const baseGit = wt().git;
    // No base diff, nothing to push
    const worktree = wt({git: {...baseGit, has_remote: true, ahead: 0, is_pushed: false, base_added_lines: 0, base_deleted_lines: 0}});
    const pr = new PRStatus({loadingStatus: 'no_pr'});
    const meta = getStatusMeta(worktree, pr);
    expect(meta.label).toBe('ready');
  });
});
