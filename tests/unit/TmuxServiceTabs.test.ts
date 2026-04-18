import {describe, test, expect} from '@jest/globals';
import {TmuxService} from '../../src/services/TmuxService.js';

describe('TmuxService tab formatting', () => {
  test('builds top worktree tabs in most-recent-first order', () => {
    const tmux = new TmuxService();
    const families = (tmux as any).buildSessionFamilies([
      {id: '$1', name: 'dev-alpha-one', lastAttached: 10, role: 'agent', base: 'dev-alpha-one'},
      {id: '$2', name: 'dev-bravo-two', lastAttached: 25, role: 'agent', base: 'dev-bravo-two'},
      {id: '$3', name: 'dev-alpha-one-shell', lastAttached: 30, role: 'shell', base: 'dev-alpha-one'},
    ]);

    const format = (tmux as any).buildTopTabsFormat('dev-alpha-one-shell', families);

    expect(format.indexOf('alpha-one')).toBeLessThan(format.indexOf('bravo-two'));
    expect(format).toContain('#[range=user|$1]');
    expect(format).toContain('#[range=user|$2]');
    expect(format).toContain('click worktrees');
  });

  test('builds bottom mode tabs with active and unavailable states', () => {
    const tmux = new TmuxService();
    const family = {
      base: 'dev-sample-feature',
      displayName: 'sample-feature',
      lastAttached: 12,
      agent: {id: '$4', name: 'dev-sample-feature', lastAttached: 12, role: 'agent', base: 'dev-sample-feature'},
      shell: {id: '$5', name: 'dev-sample-feature-shell', lastAttached: 9, role: 'shell', base: 'dev-sample-feature'},
    };

    const format = (tmux as any).buildBottomTabsFormat('dev-sample-feature-shell', family);

    expect(format).toContain(' agent ');
    expect(format).toContain(' shell ');
    expect(format).toContain(' run ');
    expect(format).toContain('click mode tabs');
    expect(format).toContain('colour148');
    expect(format).toContain('colour237');
  });
});
