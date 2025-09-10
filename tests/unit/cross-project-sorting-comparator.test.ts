import {describe, beforeEach, test, expect} from '@jest/globals';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {memoryStore, setupTestProject, setupTestWorktree} from '../utils/testHelpers.js';
import {sortWorktreeSummaries} from '../../src/contexts/WorktreeContext.js';

describe('Cross-project global sorting comparator', () => {
  beforeEach(() => {
    memoryStore.reset();
  });

  test('sorts combined worktrees by last commit desc across projects', async () => {
    setupTestProject('projA');
    setupTestProject('projB');

    const a1 = setupTestWorktree('projA', 'x');
    const b1 = setupTestWorktree('projB', 'y');
    const a2 = setupTestWorktree('projA', 'z');

    memoryStore.worktrees.get(a1.path)!.last_commit_ts = 100;
    memoryStore.worktrees.get(b1.path)!.last_commit_ts = 300;
    memoryStore.worktrees.get(a2.path)!.last_commit_ts = 200;

    const git = new FakeGitService();
    const [wa, wb] = await Promise.all([
      git.getWorktreesForProject({name: 'projA', path: '/fake/projects/projA'} as any),
      git.getWorktreesForProject({name: 'projB', path: '/fake/projects/projB'} as any)
    ]);

    const combined = [...wa, ...wb];
    const sorted = sortWorktreeSummaries(combined);

    expect(sorted.map(w => `${w.project}/${w.feature}`)).toEqual([
      'projB/y',
      'projA/z',
      'projA/x',
    ]);
  });
});

