import {TmuxService} from '../../src/services/TmuxService.js';
import {AI_TOOLS} from '../../src/constants.js';

// Mock the command execution functions
jest.mock('../../src/utils.js', () => ({
  ...jest.requireActual('../../src/utils.js'),
  runCommandQuickAsync: jest.fn(),
  runCommandQuick: jest.fn(),
  runCommand: jest.fn(),
  commandExitCode: jest.fn(),
}));

import {runCommandQuickAsync} from '../../src/utils.js';

describe('AI Tool Detection', () => {
  let tmuxService: TmuxService;

  beforeEach(() => {
    tmuxService = new TmuxService();
    jest.clearAllMocks();
  });

  describe('Claude Detection', () => {
    const claudeScreens = {
      working: `
Human: Write a function to calculate factorial

I'll help you write a factorial function. Here's a simple implementation:

\`\`\`python
def factorial(n):
    if n < 0:
        raise ValueError("Factorial is not defined for negative numbers")
    elif n == 0 or n == 1:
        return 1
    else:
        result = 1
        for i in range(2, n + 1):
            result *= i
        return result
\`\`\`

This function calculates the factorial of a non-negative integer n.

esc to interrupt`,
      waiting: `
Human: What would you like me to help you with?

I can help you with:

1. Writing code in various programming languages
2. Debugging and troubleshooting code issues  
3. Code review and optimization suggestions
4. Explaining programming concepts
5. System design and architecture advice

❯ 1. code`,
      idle: `
Welcome to Claude! I'm here to help with coding, analysis, writing, and more.

Type your message below:

│ >
│`,
    };

    test('detects Claude working state', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      mockCapture.mockResolvedValue(claudeScreens.working);
      
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes')) {
          return Promise.resolve('dev-project-feature:12345');
        }
        if (args.includes('-p') && args.includes('12345')) {
          return Promise.resolve('12345 claude');
        }
        return Promise.resolve('');
      });

      const result = await tmuxService.getAIStatus('dev-project-feature');
      expect(result.tool).toBe('claude');
      expect(result.status).toBe('working');
    });

    test('detects Claude waiting state', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      mockCapture.mockResolvedValue(claudeScreens.waiting);
      
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes')) {
          return Promise.resolve('dev-project-feature:12345');
        }
        if (args.includes('-p') && args.includes('12345')) {
          return Promise.resolve('12345 claude');
        }
        return Promise.resolve('');
      });

      const result = await tmuxService.getAIStatus('dev-project-feature');
      expect(result.tool).toBe('claude');
      expect(result.status).toBe('waiting');
    });

    test('detects Claude idle state', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      mockCapture.mockResolvedValue(claudeScreens.idle);
      
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes')) {
          return Promise.resolve('dev-project-feature:12345');
        }
        if (args.includes('-p') && args.includes('12345')) {
          return Promise.resolve('12345 claude');
        }
        return Promise.resolve('');
      });

      const result = await tmuxService.getAIStatus('dev-project-feature');
      expect(result.tool).toBe('claude');
      expect(result.status).toBe('idle');
    });
  });

  describe('Codex Detection', () => {
    const codexScreens = {
      working: `
Structure

- src/: TypeScript source for CLI, UI, services, and utilities.
- tests/: Unit, integration, and e2e tests with fakes and helpers.

Generating code...

▌ Writing implementation
 Esc to interrupt   Ctrl+J newline   Ctrl+T transcript   Ctrl+C quit   5234 tokens used   90% context left
`,
      waiting: `
- Build and run CLI: npm install && npm run build && npm run cli
- Point to projects dir: PROJECTS_DIR=/path/to/projects npm run cli

1. Do you want me to run the tests?
2. Should I build the project?

▌ 
 Ctrl+J newline   Ctrl+T transcript   Ctrl+C quit   22521 tokens used   94% context left
`,
      idle: `
Ready to help with your code!

▌ 
 ⏎ send   Ctrl+J newline   Ctrl+T transcript   Ctrl+C quit   0 tokens used   100% context left
`,
    };

    test('detects Codex working state', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      mockCapture.mockResolvedValue(codexScreens.working);
      
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
      expect(result.status).toBe('working');
    });

    test('detects Codex waiting state', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      mockCapture.mockResolvedValue(codexScreens.waiting);
      
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes')) {
          return Promise.resolve('dev-project-feature:12345');
        }
        if (args.includes('-p') && args.includes('12345')) {
          return Promise.resolve('12345 node /home/user/.nvm/versions/node/v24.7.0/bin/codex');
        }
        return Promise.resolve('');
      });

      const result = await tmuxService.getAIStatus('dev-project-feature');
      expect(result.tool).toBe('codex');
      expect(result.status).toBe('waiting');
    });

    test('detects Codex idle state', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      mockCapture.mockResolvedValue(codexScreens.idle);
      
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes')) {
          return Promise.resolve('dev-project-feature:12345');
        }
        if (args.includes('-p') && args.includes('12345')) {
          return Promise.resolve('12345 node /home/user/.nvm/versions/node/v24.7.0/bin/codex');
        }
        return Promise.resolve('');
      });

      const result = await tmuxService.getAIStatus('dev-project-feature');
      expect(result.tool).toBe('codex');
      expect(result.status).toBe('idle');
    });
  });

  describe('Gemini Detection', () => {
    const geminiScreens = {
      working: `
 ╭───────────────────────────╮
 │ ✔ ReadFile package.json  │
 ╰───────────────────────────╯
 ╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
 │ ✔ FindFiles '**/*.test.ts*'                                                                                                                                                          │
 │                                                                                                                                                                                       │
 │    Found 22 matching file(s)                                                                                                                                                          │
 ╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
⠏ Analyzing test files...   esc to cancel

~/projects/coding-agent-team-branches/npm-package (feature/npm-package*)                               no sandbox (see /docs)                                  gemini-2.5-pro (99% context left)
`,
      waitingForUser: `
 ╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
 │ ?  Shell npm test ←                                                                                                                                                                          │
 │                                                                                                                                                                                              │
 │   npm test                                                                                                                                                                                   │
 │                                                                                                                                                                                              │
 │ Allow execution of: 'npm'?                                                                                                                                                                   │
 │                                                                                                                                                                                              │
 │ ● 1. Yes, allow once                                                                                                                                                                         │
 │   2. Yes, allow always ...                                                                                                                                                                   │
 │   3. No, suggest changes (esc)                                                                                                                                                               │
 │                                                                                                                                                                                              │
 ╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
⠏ Waiting for user confirmation...

~/projects/coding-agent-team-branches/npm-package (feature/npm-package*)                               no sandbox (see /docs)                                  gemini-2.5-pro (99% context left)
`,
      idle: `
 ███            █████████  ██████████ ██████   ██████ █████ ██████   █████ █████
░░███         ███░░░░░███░░███░░░░░█░░██████ ██████ ░░███ ░░██████ ░░███ ░░███
  ░░███      ███     ░░░  ░███  █ ░  ░███░█████░███  ░███  ░███░███ ░███  ░███
    ░░███   ░███          ░██████    ░███░░███ ░███  ░███  ░███░░███░███  ░███
     ███░    ░███    █████ ░███░░█    ░███ ░░░  ░███  ░███  ░███ ░░██████  ░███
   ███░      ░░███  ░░███  ░███ ░   █ ░███      ░███  ░███  ░███  ░░█████  ░███
 ███░         ░░█████████  ██████████ █████     █████ █████ █████  ░░█████ █████
░░░            ░░░░░░░░░  ░░░░░░░░░░ ░░░░░     ░░░░░ ░░░░░ ░░░░░    ░░░░░ ░░░░░

╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ >   Type your message or @path/to/file                                                                                                                                                       │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
~/projects/coding-agent-team-branches/npm-package (feature/npm-package*)                               no sandbox (see /docs)                                 gemini-2.5-pro (100% context left)
`,
    };

    test('detects Gemini working state', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      mockCapture.mockResolvedValue(geminiScreens.working);
      
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
      expect(result.status).toBe('working');
    });

    test('detects Gemini waiting for user confirmation', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      mockCapture.mockResolvedValue(geminiScreens.waitingForUser);
      
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes')) {
          return Promise.resolve('dev-project-feature:12345');
        }
        if (args.includes('-p') && args.includes('12345')) {
          return Promise.resolve('12345 node /home/user/.nvm/versions/node/v24.7.0/bin/gemini');
        }
        return Promise.resolve('');
      });

      const result = await tmuxService.getAIStatus('dev-project-feature');
      expect(result.tool).toBe('gemini');
      expect(result.status).toBe('waiting');
    });

    test('detects Gemini idle state', async () => {
      const mockCapture = jest.spyOn(tmuxService as any, 'capturePane');
      mockCapture.mockResolvedValue(geminiScreens.idle);
      
      (runCommandQuickAsync as jest.Mock).mockImplementation((args) => {
        if (args.includes('list-panes')) {
          return Promise.resolve('dev-project-feature:12345');
        }
        if (args.includes('-p') && args.includes('12345')) {
          return Promise.resolve('12345 node /usr/local/bin/gemini');
        }
        return Promise.resolve('');
      });

      const result = await tmuxService.getAIStatus('dev-project-feature');
      expect(result.tool).toBe('gemini');
      expect(result.status).toBe('idle');
    });
  });

  describe('Batch Detection', () => {
    test('detects multiple AI tools in batch', async () => {
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

      // Access the aiToolService from the tmuxService
      const aiToolService = (tmuxService as any).aiToolService;
      const result = await aiToolService.detectAllSessionAITools();
      
      expect(result.get('dev-project1-feature1')).toBe('claude');
      expect(result.get('dev-project2-feature2')).toBe('codex');
      expect(result.get('dev-project3-feature3')).toBe('gemini');
    });
  });
});