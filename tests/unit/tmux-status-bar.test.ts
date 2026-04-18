jest.mock('../../src/shared/utils/commandExecutor.js', () => ({
  ...jest.requireActual('../../src/shared/utils/commandExecutor.js'),
  runCommand: jest.fn(),
  runInteractive: jest.fn(),
}));

import {TmuxService} from '../../src/services/TmuxService.js';
import {runCommand, runInteractive} from '../../src/shared/utils/commandExecutor.js';

describe('TmuxService status bar', () => {
  let tmuxService: TmuxService;

  beforeEach(() => {
    tmuxService = new TmuxService();
    jest.clearAllMocks();
  });

  test('configures an informative status bar with explicit session metadata', () => {
    tmuxService.configureSessionUI('dev-anything', {
      project: 'tmux-status-bar',
      worktree: 'beautiful-status-bar',
      sessionKind: 'agent',
    });

    const calls = (runCommand as jest.Mock).mock.calls.map(([args]) => args);

    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-anything', '@devteam_project', 'tmux-status-bar']);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-anything', '@devteam_worktree', 'beautiful-status-bar']);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-anything', '@devteam_session_kind', 'Agent']);

    const statusFormatCall = calls.find((args) => args[0] === 'tmux' && args[1] === 'set-option' && args[4] === 'status-format[0]');
    expect(statusFormatCall).toBeDefined();
    expect(statusFormatCall?.[5]).toContain('DEVTEAM');
    expect(statusFormatCall?.[5]).toContain('PROJECT');
    expect(statusFormatCall?.[5]).toContain('WORKTREE');
    expect(statusFormatCall?.[5]).toContain('SESSION');
    expect(statusFormatCall?.[5]).toContain('#{@devteam_project}');
    expect(statusFormatCall?.[5]).toContain('#{@devteam_worktree}');
    expect(statusFormatCall?.[5]).toContain('#{@devteam_session_kind}');
    expect(statusFormatCall?.[5]).toContain('#{pane_current_command}');
    expect(statusFormatCall?.[5]).toContain('Return to devteam: Prefix+d');
  });

  test('falls back to parsing session names for shell sessions', () => {
    tmuxService.configureSessionUI('dev-myproject-feature-redesign-shell');

    const calls = (runCommand as jest.Mock).mock.calls.map(([args]) => args);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-myproject-feature-redesign-shell', '@devteam_project', 'myproject']);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-myproject-feature-redesign-shell', '@devteam_worktree', 'feature-redesign']);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-myproject-feature-redesign-shell', '@devteam_session_kind', 'Shell']);
  });

  test('attaches after configuring the richer session controls', () => {
    tmuxService.attachSessionWithControls('dev-demo-run', {
      project: 'demo',
      worktree: 'bar-refresh',
      sessionKind: 'execute',
    });

    expect(runInteractive).toHaveBeenCalledWith('tmux', ['attach-session', '-t', 'dev-demo-run']);
    const calls = (runCommand as jest.Mock).mock.calls.map(([args]) => args);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-demo-run', '@devteam_session_kind', 'Execute']);
  });
});
