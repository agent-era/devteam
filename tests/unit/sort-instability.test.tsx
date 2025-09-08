import {ProjectInfo} from '../../src/models.js';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {memoryStore, setupTestProject, setupTestWorktree} from '../utils/testHelpers.js';

// Unit test that validates the stable ordering: last_commit_ts desc, feature asc
describe('Worktree sort order - last_commit_ts desc, feature asc', () => {
  beforeEach(() => {
    memoryStore.reset();
  });

  test('fake git service returns worktrees sorted by last commit desc with feature tie-breaker', async () => {
    // Setup: one project with three features
    const proj = setupTestProject('proj');
    const a = setupTestWorktree('proj', 'a');
    const b = setupTestWorktree('proj', 'b');
    const c = setupTestWorktree('proj', 'c');

    const now = Math.floor(Date.now() / 1000);
    memoryStore.worktrees.get(a.path)!.last_commit_ts = now - 3000;
    memoryStore.worktrees.get(b.path)!.last_commit_ts = now - 2000;
    memoryStore.worktrees.get(c.path)!.last_commit_ts = now - 1000;

    const gitService = new FakeGitService();
    const list1 = await gitService.getWorktreesForProject(new ProjectInfo({name: proj.name, path: proj.path}));
    expect(list1.map(w => w.feature)).toEqual(['c', 'b', 'a']);

    // Make b newest
    memoryStore.worktrees.get(b.path)!.last_commit_ts = now + 100;
    const list2 = await gitService.getWorktreesForProject(new ProjectInfo({name: proj.name, path: proj.path}));
    expect(list2.map(w => w.feature)).toEqual(['b', 'c', 'a']);

    // Tie-breaker: if c and b have same ts, order by feature asc
    memoryStore.worktrees.get(c.path)!.last_commit_ts = memoryStore.worktrees.get(b.path)!.last_commit_ts as number;
    const list3 = await gitService.getWorktreesForProject(new ProjectInfo({name: proj.name, path: proj.path}));
    expect(list3.map(w => w.feature)).toEqual(['b', 'c', 'a']);
  });
});
