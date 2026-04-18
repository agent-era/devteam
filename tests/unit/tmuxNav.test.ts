import {describe, test, expect} from '@jest/globals';
import {baseSessionName, modeLabel, modeSessionName, sessionMode} from '../../src/shared/utils/tmuxNav.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';

describe('tmux nav helpers', () => {
  test('parses session mode and base session correctly', () => {
    expect(sessionMode('dev-proj-feat')).toBe('agent');
    expect(sessionMode('dev-proj-feat-shell')).toBe('shell');
    expect(sessionMode('dev-proj-feat-run')).toBe('run');
    expect(baseSessionName('dev-proj-feat-shell')).toBe('dev-proj-feat');
    expect(baseSessionName('dev-proj-feat-run')).toBe('dev-proj-feat');
  });

  test('builds mode session names and labels', () => {
    const tmux = new FakeTmuxService();
    expect(modeSessionName(tmux as any, 'proj', 'feat', 'agent')).toBe('dev-proj-feat');
    expect(modeSessionName(tmux as any, 'proj', 'feat', 'shell')).toBe('dev-proj-feat-shell');
    expect(modeSessionName(tmux as any, 'proj', 'feat', 'run')).toBe('dev-proj-feat-run');
    expect(modeLabel('agent')).toBe('A');
    expect(modeLabel('shell')).toBe('S');
    expect(modeLabel('run')).toBe('R');
  });
});
