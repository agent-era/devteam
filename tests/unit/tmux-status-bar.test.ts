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
      aiTool: 'claude',
    });

    const calls = (runCommand as jest.Mock).mock.calls.map(([args]) => args);

    expect(calls).toContainEqual(['tmux', 'set-option', '-g', 'mouse', 'on']);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-anything', '@devteam_project', 'tmux-status-bar']);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-anything', '@devteam_worktree', 'beautiful-status-bar']);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-anything', '@devteam_session_chip', '#[fg=colour231,bg=colour31,bold] AGENT #[fg=colour232,bg=colour117,bold] claude ']);

    const statusFormatCall = calls.find((args) => args[0] === 'tmux' && args[1] === 'set-option' && args[4] === 'status-format[0]');
    expect(statusFormatCall).toBeDefined();
    expect(statusFormatCall?.[5]).toContain('#{@devteam_project}');
    expect(statusFormatCall?.[5]).toContain('#{@devteam_worktree}');
    expect(statusFormatCall?.[5]).toContain('#{@devteam_session_chip}');
    expect(statusFormatCall?.[5]).toContain('Click here to return (or Ctrl+b, then d)');
    expect(statusFormatCall?.[5]).toContain('DEVTEAM');
    expect(calls).toContainEqual(['tmux', 'bind-key', '-n', 'MouseDown1Status', 'detach-client']);
    expect(calls).toContainEqual(['tmux', 'bind-key', '-n', 'MouseDown1StatusRight', 'detach-client']);
    expect(calls).toContainEqual(['tmux', 'bind-key', '-n', 'MouseUp1Status', 'detach-client']);
    expect(calls).toContainEqual(['tmux', 'bind-key', '-n', 'MouseUp1StatusRight', 'detach-client']);
  });

  test('falls back to parsing session names for shell sessions', () => {
    tmuxService.configureSessionUI('dev-myproject-feature-redesign-shell');

    const calls = (runCommand as jest.Mock).mock.calls.map(([args]) => args);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-myproject-feature-redesign-shell', '@devteam_project', 'myproject']);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-myproject-feature-redesign-shell', '@devteam_worktree', 'feature-redesign']);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-myproject-feature-redesign-shell', '@devteam_session_chip', '#[fg=colour231,bg=colour31,bold] SHELL ']);
  });

  test('attaches after configuring the richer session controls', () => {
    tmuxService.attachSessionWithControls('dev-demo-run', {
      project: 'demo',
      worktree: 'bar-refresh',
      sessionKind: 'execute',
      aiTool: 'codex',
    });

    expect(runInteractive).toHaveBeenCalledWith('tmux', ['attach-session', '-t', 'dev-demo-run']);
    const calls = (runCommand as jest.Mock).mock.calls.map(([args]) => args);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-demo-run', '@devteam_session_chip', '#[fg=colour231,bg=colour31,bold] EXECUTE ']);
  });

  test('renders codex as a separate chip value beside the AGENT label', () => {
    tmuxService.configureSessionUI('dev-codex-demo', {
      project: 'demo',
      worktree: 'codex-feature',
      sessionKind: 'agent',
      aiTool: 'codex',
    });

    const calls = (runCommand as jest.Mock).mock.calls.map(([args]) => args);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-codex-demo', '@devteam_session_chip', '#[fg=colour231,bg=colour31,bold] AGENT #[fg=colour232,bg=colour117,bold] codex ']);
  });

  test('renders gemini as lowercase in the session value chip', () => {
    tmuxService.configureSessionUI('dev-gemini-demo', {
      project: 'demo',
      worktree: 'gemini-feature',
      sessionKind: 'agent',
      aiTool: 'gemini',
    });

    const calls = (runCommand as jest.Mock).mock.calls.map(([args]) => args);
    expect(calls).toContainEqual(['tmux', 'set-option', '-t', 'dev-gemini-demo', '@devteam_session_chip', '#[fg=colour231,bg=colour31,bold] AGENT #[fg=colour232,bg=colour117,bold] gemini ']);
  });
});
