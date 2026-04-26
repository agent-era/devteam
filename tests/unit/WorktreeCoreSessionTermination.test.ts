import {describe, expect, test} from '@jest/globals';
import {WorktreeCore} from '../../src/cores/WorktreeCore.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';

describe('WorktreeCore session termination', () => {
  test('terminateFeatureSessions kills agent, shell, and run sessions for a feature', async () => {
    const tmux = new FakeTmuxService();
    const core = new WorktreeCore({git: {} as any, tmux} as any);

    const agent = tmux.sessionName('proj', 'feat');
    const shell = tmux.shellSessionName('proj', 'feat');
    const run = tmux.runSessionName('proj', 'feat');

    tmux.createSession(agent, '/fake/proj-branches/feat');
    tmux.createSession(shell, '/fake/proj-branches/feat');
    tmux.createSession(run, '/fake/proj-branches/feat');

    await core.terminateFeatureSessions('proj', 'feat');

    expect(tmux.hasSession(agent)).toBe(false);
    expect(tmux.hasSession(shell)).toBe(false);
    expect(tmux.hasSession(run)).toBe(false);
  });
});
