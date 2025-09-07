import {TmuxService} from '../../src/services/TmuxService.js';
import {FakeWorktreeService} from '../fakes/FakeWorktreeService.js';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {runCommandQuickAsync, commandExitCode} from '../../src/utils.js';
import {memoryStore} from '../fakes/stores.js';
import type {AITool} from '../../src/models.js';

jest.mock('../../src/utils.js', () => ({
  runCommandQuickAsync: jest.fn(),
  runCommandQuick: jest.fn(),
  runCommand: jest.fn(),
  commandExitCode: jest.fn(),
  runInteractive: jest.fn(),
  getCleanEnvironment: jest.fn(() => ({ ...process.env, npm_config_prefix: undefined })),
}));

describe('AI Tool Switching', () => {
  let tmuxService: TmuxService;
  let fakeTmuxService: FakeTmuxService;
  let fakeGitService: FakeGitService;
  let worktreeService: FakeWorktreeService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear memory store between tests
    memoryStore.projects.clear();
    memoryStore.worktrees.clear();
    memoryStore.sessions.clear();
    memoryStore.gitStatus.clear();
    memoryStore.prStatus.clear();
    memoryStore.remoteBranches.clear();
    memoryStore.archivedWorktrees.clear();
    
    tmuxService = new TmuxService();
    fakeTmuxService = new FakeTmuxService();
    fakeGitService = new FakeGitService();
    worktreeService = new FakeWorktreeService(fakeGitService, fakeTmuxService);
  });

  describe('Tool Selection with Fake Services', () => {
    test('switches from Claude to Codex', async () => {
      // First we need to create a project
      fakeGitService.createProject('test');
      
      // Create a worktree with Claude session
      const created = fakeGitService.createWorktree('test', 'feature1');
      expect(created).toBe(true);
      
      const worktreePath = `/fake/projects/test-branches/feature1`;
      fakeTmuxService.createSessionWithCommand('dev-test-feature1', worktreePath, 'claude');
      fakeTmuxService.setAITool('dev-test-feature1', 'claude');
      
      // Switch to Codex
      await worktreeService.switchAITool('test', 'feature1', 'codex');
      
      // Verify session was recreated with new tool
      const sessionInfo = fakeTmuxService.getSessionInfo('dev-test-feature1');
      expect(sessionInfo?.ai_tool).toBe('codex');
    });

    test('switches from Codex to Gemini', async () => {
      // First we need to create a project
      fakeGitService.createProject('test');
      
      // Create a worktree with Codex session
      const created = fakeGitService.createWorktree('test', 'feature1');
      expect(created).toBe(true);
      
      const worktreePath = `/fake/projects/test-branches/feature1`;
      fakeTmuxService.createSessionWithCommand('dev-test-feature1', worktreePath, 'codex');
      fakeTmuxService.setAITool('dev-test-feature1', 'codex');
      
      // Switch to Gemini
      await worktreeService.switchAITool('test', 'feature1', 'gemini');
      
      // Verify session was recreated with new tool
      const sessionInfo = fakeTmuxService.getSessionInfo('dev-test-feature1');
      expect(sessionInfo?.ai_tool).toBe('gemini');
    });

    test('creates new session when no AI session exists', async () => {
      // First we need to create a project
      fakeGitService.createProject('test');
      
      // Create worktree without session
      const created = fakeGitService.createWorktree('test', 'feature1');
      expect(created).toBe(true);
      
      // Switch to Codex (will create new session)
      await worktreeService.switchAITool('test', 'feature1', 'codex');
      
      // Verify session was created with selected tool
      const sessionInfo = fakeTmuxService.getSessionInfo('dev-test-feature1');
      expect(sessionInfo).toBeDefined();
      expect(sessionInfo?.ai_tool).toBe('codex');
    });

    test('generates correct command for each AI tool', () => {
      expect(worktreeService.getAIToolCommand('claude')).toBe('claude');
      expect(worktreeService.getAIToolCommand('codex')).toBe('codex');
      expect(worktreeService.getAIToolCommand('gemini')).toBe('gemini');
      expect(worktreeService.getAIToolCommand('none')).toBe('claude'); // Default
    });
  });

  describe('Tool Detection with Real TmuxService', () => {
    test('correctly prioritizes working state over waiting for Codex', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      
      // Mock screen that has both "Esc to interrupt" (working) and no "⏎ send" (waiting indicator)
      // Working should take priority
      mockCapture.mockResolvedValue(`
Generating code...
▌ Writing implementation
 Esc to interrupt   Ctrl+J newline   Ctrl+T transcript   Ctrl+C quit
`);
      
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes')) {
          return Promise.resolve('dev-project-feature:12345');
        }
        if (args.includes('-p') && args.includes('12345')) {
          return Promise.resolve('12345 node /usr/bin/codex');
        }
        return Promise.resolve('');
      });

      const result = await tmuxService.getAIStatus('dev-project-feature');
      expect(result.tool).toBe('codex');
      expect(result.status).toBe('working'); // Working takes priority
    });

    test('correctly detects Gemini waiting state', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      
      mockCapture.mockResolvedValue(`
 ╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
 │ ?  Shell npm test ←                                                                                                                                                                          │
 │                                                                                                                                                                                              │
 │   npm test                                                                                                                                                                                   │
 │                                                                                                                                                                                              │
 │ Allow execution of: 'npm'?                                                                                                                                                                   │
 │                                                                                                                                                                                              │
 │ Waiting for user input...                                                                                                                                                                   │
 ╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
~/projects/test (feature/test*)                               no sandbox (see /docs)                                  gemini-2.5-pro (99% context left)
`);
      
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes')) {
          return Promise.resolve('dev-project-feature:12345');
        }
        if (args.includes('-p') && args.includes('12345')) {
          return Promise.resolve('12345 node /usr/bin/gemini');
        }
        return Promise.resolve('');
      });

      const result = await tmuxService.getAIStatus('dev-project-feature');
      expect(result.tool).toBe('gemini');
      expect(result.status).toBe('waiting');
    });
  });

  describe('Batch Tool Detection', () => {
    test('detects multiple AI tools in batch operation', async () => {
      // Mock multiple sessions
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes') && args.includes('-a')) {
          return Promise.resolve(`dev-project1-feature:12345
dev-project2-feature:12346
dev-project3-feature:12347`);
        }
        if (args.includes('ps')) {
          return Promise.resolve(`12345 claude
12346 node /usr/bin/codex
12347 node /usr/bin/gemini`);
        }
        return Promise.resolve('');
      });
      
      // Test batch detection functionality
      const aiToolService = (tmuxService as any).aiToolService;
      const toolsMap = await aiToolService.detectAllSessionAITools();
      
      expect(toolsMap.get('dev-project1-feature')).toBe('claude');
      expect(toolsMap.get('dev-project2-feature')).toBe('codex');
      expect(toolsMap.get('dev-project3-feature')).toBe('gemini');
      
      // Verify the correct commands were called
      expect(runCommandQuickAsync).toHaveBeenCalledWith([
        'tmux', 'list-panes', '-a', '-F', '#{session_name}:#{pane_pid}'
      ]);
      expect(runCommandQuickAsync).toHaveBeenCalledWith([
        'ps', '-p', '12345,12346,12347', '-o', 'pid=', '-o', 'args='
      ]);
    });
  });
});