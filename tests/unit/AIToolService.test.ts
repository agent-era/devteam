import {AIToolService} from '../../src/services/AIToolService.js';
import {AI_TOOLS} from '../../src/constants.js';

// Mock the command execution functions
jest.mock('../../src/shared/utils/commandExecutor.js', () => ({
  ...jest.requireActual('../../src/shared/utils/commandExecutor.js'),
  runCommandQuickAsync: jest.fn(),
  runCommand: jest.fn(),
}));

import {runCommandQuickAsync, runCommand} from '../../src/shared/utils/commandExecutor.js';

describe('AIToolService', () => {
  let aiToolService: AIToolService;

  beforeEach(() => {
    aiToolService = new AIToolService();
    jest.clearAllMocks();
  });

  // detectAITool removed in favor of boolean pane check. Keep lightweight checks here.
  describe('isAIPaneCommand (pane heuristic)', () => {
    test('returns true for known tool commands', () => {
      expect(aiToolService.isAIPaneCommand('claude')).toBe(true);
      expect(aiToolService.isAIPaneCommand('/usr/bin/claude')).toBe(true);
      expect(aiToolService.isAIPaneCommand('CLAUDE')).toBe(true);
    });

    test('returns true for node-based tools', () => {
      expect(aiToolService.isAIPaneCommand('node')).toBe(true);
      expect(aiToolService.isAIPaneCommand('NODE')).toBe(true);
    });

    test('returns false for unrelated commands', () => {
      expect(aiToolService.isAIPaneCommand('bash')).toBe(false);
      expect(aiToolService.isAIPaneCommand('vim')).toBe(false);
      expect(aiToolService.isAIPaneCommand('python')).toBe(false);
    });
  });

  describe('detectAllSessionAITools', () => {
    test('detects AI tools across multiple sessions', async () => {
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes') && args.includes('-a')) {
          return Promise.resolve(`dev-project1-feature1:11111
dev-project2-feature2:22222
dev-project3-feature3:33333`);
        }
        if (args.includes('-p') && args.includes('11111,22222,33333')) {
          return Promise.resolve(` 11111 claude
 22222 node /usr/bin/codex
 33333 node /usr/bin/gemini`);
        }
        return Promise.resolve('');
      });

      const result = await aiToolService.detectAllSessionAITools();
      
      expect(result.get('dev-project1-feature1')).toBe('claude');
      expect(result.get('dev-project2-feature2')).toBe('codex');
      expect(result.get('dev-project3-feature3')).toBe('gemini');
    });

    test('handles empty session list', async () => {
      (runCommandQuickAsync as jest.Mock).mockResolvedValue('');
      
      const result = await aiToolService.detectAllSessionAITools();
      expect(result.size).toBe(0);
    });

    test('filters to dev- sessions only', async () => {
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes') && args.includes('-a')) {
          return Promise.resolve(`dev-project-feature:11111
other-session:22222
random-session:33333`);
        }
        if (args.includes('-p') && args.includes('11111')) {
          return Promise.resolve(' 11111 claude');
        }
        return Promise.resolve('');
      });

      const result = await aiToolService.detectAllSessionAITools();
      
      expect(result.get('dev-project-feature')).toBe('claude');
      expect(result.has('other-session')).toBe(false);
      expect(result.has('random-session')).toBe(false);
    });
  });

  describe('getStatusForTool', () => {
    describe('Claude status detection', () => {
      test('detects working state', () => {
        const workingText = '· Calculating… (12s · ↓ 512 tokens)';
        expect(aiToolService.getStatusForTool(workingText, 'claude')).toBe('working');
      });

      test('detects waiting state', () => {
        const waitingText = 'Choose an option:\n❯ 1. Create file\n❯ 2. Update code';
        expect(aiToolService.getStatusForTool(waitingText, 'claude')).toBe('waiting');
      });

      test('detects waiting permission prompt', () => {
        const waitingText = "Claude needs permission.\nAllow execution of: 'npm test'?\nYes, allow once";
        expect(aiToolService.getStatusForTool(waitingText, 'claude')).toBe('waiting');
      });

      test('detects idle state as default', () => {
        const idleText = '│ >\n│ Type your message';
        expect(aiToolService.getStatusForTool(idleText, 'claude')).toBe('idle');
      });

      test('idle with ❯ prompt in scrollback alongside numbered list is not waiting', () => {
        const idleWithScrollback = '1. Fix the bug\n2. Add tests\n3. Update docs\n❯ ';
        expect(aiToolService.getStatusForTool(idleWithScrollback, 'claude')).toBe('idle');
      });

      test('idle during active work with numbered plan in scrollback is not waiting', () => {
        const workingWithPlan = '1. Step one\n2. Step two\n❯ run the plan\n● Bash(npm test)';
        expect(aiToolService.getStatusForTool(workingWithPlan, 'claude')).toBe('idle');
      });
    });

    describe('Codex status detection', () => {
      test('detects working state', () => {
        const workingText = 'Generating code... Esc to interrupt';
        expect(aiToolService.getStatusForTool(workingText, 'codex')).toBe('working');
      });

      test('detects waiting state (no send button)', () => {
        const waitingText = '▌ What would you like me to help with?';
        expect(aiToolService.getStatusForTool(waitingText, 'codex')).toBe('waiting');
      });

      test('does not report waiting without an interactive cursor', () => {
        const idleLikeText = 'Session output without prompt affordances';
        expect(aiToolService.getStatusForTool(idleLikeText, 'codex')).toBe('idle');
      });

      test('detects idle state (has send button)', () => {
        const idleText = '▌ Ready to help\n⏎ send   Ctrl+J newline';
        expect(aiToolService.getStatusForTool(idleText, 'codex')).toBe('idle');
      });
    });

    describe('Gemini status detection', () => {
      test('detects working state', () => {
        const workingText = 'Analyzing files... esc to cancel';
        expect(aiToolService.getStatusForTool(workingText, 'gemini')).toBe('working');
      });

      test('detects waiting state', () => {
        const waitingText = 'Waiting for user confirmation... Allow execution?';
        expect(aiToolService.getStatusForTool(waitingText, 'gemini')).toBe('waiting');
      });

      test('detects idle state as default', () => {
        const idleText = '│ > Type your message or @path/to/file';
        expect(aiToolService.getStatusForTool(idleText, 'gemini')).toBe('idle');
      });
    });

    test('returns not_running for none tool', () => {
      expect(aiToolService.getStatusForTool('any text', 'none')).toBe('not_running');
    });
  });

  describe('Tool management', () => {
    test('getAvailableTools returns all configured tools', () => {
      const tools = aiToolService.getAvailableTools();
      expect(tools).toContain('claude');
      expect(tools).toContain('codex');
      expect(tools).toContain('gemini');
      expect(tools.length).toBe(Object.keys(AI_TOOLS).length);
    });

    test('getToolName returns display names', () => {
      expect(aiToolService.getToolName('claude')).toBe('Claude');
      expect(aiToolService.getToolName('codex')).toBe('OpenAI Codex');
      expect(aiToolService.getToolName('gemini')).toBe('Gemini');
      expect(aiToolService.getToolName('none')).toBe('None');
    });

    test('getToolConfig returns tool configuration', () => {
      const claudeConfig = aiToolService.getToolConfig('claude');
      expect(claudeConfig).not.toBeNull();
      if (claudeConfig) {
        expect(claudeConfig.name).toBe('Claude');
        expect(claudeConfig.command).toBe('claude');
        expect(claudeConfig.processPatterns).toContain('claude');
      }
    });

    test('getToolConfig returns null for none tool', () => {
      const noneConfig = aiToolService.getToolConfig('none');
      expect(noneConfig).toBeNull();
    });
  });

  describe('Tool launching', () => {
    test('launchTool creates tmux session with AI tool (resume flag baked in)', () => {
      aiToolService.launchTool('claude', 'test-session', '/test/path');

      expect(runCommand).toHaveBeenCalledWith([
        'tmux', 'new-session', '-ds', 'test-session', '-c', '/test/path', 'claude --continue'
      ]);
    });

    test('launchTool ignores none tool', () => {
      aiToolService.launchTool('none', 'test-session', '/test/path');
      expect(runCommand).not.toHaveBeenCalled();
    });
  });
});
