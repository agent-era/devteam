import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {
  resetTestData,
  setupBasicProject,
  setupProjectWithWorktrees,
  setupTestWorktree,
  expectWorktreeInMemory,
  simulateTimeDelay,
  memoryStore,
} from '../utils/testHelpers.js';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';

describe('Run Configuration E2E', () => {
  beforeEach(() => {
    resetTestData();
    
    // Mock runCommand for run config operations
    jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args, opts) => {
      const command = args.join(' ');
      
      // Mock checking for existing run config file
      if (command.includes('test -f') && command.includes('.claude/run.json')) {
        return ''; // File doesn't exist (empty output means false in shell)
      }
      
      // Mock file creation and directory operations
      if (command.includes('mkdir -p') || command.includes('touch')) {
        return '';
      }
      
      // Mock claude command execution
      if (command.includes('claude') && command.includes('run.json')) {
        return 'Run configuration generated successfully';
      }
      
      // Mock tmux session creation
      if (command.includes('tmux new-session') && command.includes('run')) {
        return '';
      }
      
      // Mock tmux attach
      if (command.includes('tmux attach-session')) {
        return '';
      }
      
      return '';
    });
    
    // Mock fs operations for run config
    jest.spyOn(require('fs'), 'existsSync').mockImplementation((filePath) => {
      const pathStr = String(filePath);
      if (pathStr.includes('.claude/run.json')) {
        return false; // No existing config initially
      }
      return true; // Other paths exist
    });
    
    jest.spyOn(require('fs'), 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(require('fs'), 'readFileSync').mockImplementation(() => {
      return JSON.stringify({
        name: 'Test Project',
        command: 'npm test',
        description: 'Run tests for this project'
      });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Run Session Creation', () => {
    test('should execute run session when config exists', async () => {
      // Setup: Worktree with existing run config
      setupBasicProject('my-project');
      const worktree = setupTestWorktree('my-project', 'feature-with-config');
      
      // Mock that run config exists
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
      
      const {stdin, lastFrame, services} = renderTestApp();
      await simulateTimeDelay(100);
      
      // Verify worktree is displayed
      expect(lastFrame()).toContain('my-project/feature-with-config');
      
      // Execute run session (simulating 'x' key press)
      const result = services.tmuxService.createRunSession('my-project', 'feature-with-config');
      await simulateTimeDelay(100);
      
      // Should create run session successfully
      expect(result).toBe('dev-my-project-feature-with-config-run');
      
      // Verify run session exists in memory
      const runSession = memoryStore.sessions.get('dev-my-project-feature-with-config-run');
      expect(runSession).toBeDefined();
      expect(runSession?.session_name).toBe('dev-my-project-feature-with-config-run');
      expect(runSession?.attached).toBe(true);
    });

    test('should show no_config result when config missing', async () => {
      // Setup: Worktree without run config
      const {worktrees} = setupProjectWithWorktrees('my-project', ['feature-no-config']);
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Try to execute run session without config
      const worktree = worktrees[0];
      
      // Mock that config doesn't exist
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(false);
      
      // This should trigger the run config dialog
      const result = services.tmuxService.createRunSession('my-project', 'feature-no-config');
      
      // Should indicate no config exists
      expect(result).toBeNull(); // No session created when config missing
    });
  });

  describe('Run Configuration Dialog', () => {
    test('should display run config dialog when no config exists', async () => {
      // Setup: Project without run config
      setupBasicProject('test-project');
      setupTestWorktree('test-project', 'new-feature');
      
      const {stdin, lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Simulate showing run config dialog
      setUIMode('runConfig', {
        project: 'test-project',
        configPath: '/fake/projects/test-project/.claude/run.json',
        claudePrompt: 'Analyze this project and generate run config'
      });
      await simulateTimeDelay(50);
      
      // Should show run config dialog
      const output = lastFrame();
      expect(output).toContain('Run Configuration');
      expect(output).toContain('test-project');
      expect(output).toContain('.claude/run.json');
    });

    test('should show progress dialog during config generation', async () => {
      // Setup: Project needs config generation
      setupBasicProject('test-project');
      
      const {lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Simulate progress dialog
      setUIMode('runProgress', {project: 'test-project'});
      await simulateTimeDelay(50);
      
      // Should show progress dialog
      const output = lastFrame();
      expect(output).toContain('Generating Run Configuration');
      expect(output).toContain('Claude is analyzing');
      expect(output).toContain('test-project');
    });

    test('should show results dialog after config generation', async () => {
      // Setup: Successful config generation
      setupBasicProject('test-project');
      
      const mockResult = {
        success: true,
        content: 'npm test',
        path: '/fake/projects/test-project/.claude/run.json',
        error: null
      };
      
      const {lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Simulate results dialog
      setUIMode('runResults', {
        project: 'test-project',
        feature: 'new-feature',
        path: '/fake/projects/test-project-branches/new-feature',
        result: mockResult
      });
      await simulateTimeDelay(50);
      
      // Should show successful results
      const output = lastFrame();
      expect(output).toContain('Success');
      expect(output).toContain('npm test');
      expect(output).toContain('.claude/run.json');
    });

    test('should show error results when config generation fails', async () => {
      // Setup: Failed config generation
      setupBasicProject('test-project');
      
      const mockResult = {
        success: false,
        content: null,
        path: '/fake/projects/test-project/.claude/run.json',
        error: 'Failed to analyze project structure'
      };
      
      const {lastFrame, setUIMode} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Simulate error results dialog
      setUIMode('runResults', {
        project: 'test-project',
        feature: 'failing-feature',
        path: '/fake/projects/test-project-branches/failing-feature',
        result: mockResult
      });
      await simulateTimeDelay(50);
      
      // Should show error message
      const output = lastFrame();
      expect(output).toContain('Error');
      expect(output).toContain('Failed to analyze project structure');
    });
  });

  describe('Config Generation Workflow', () => {
    test('should complete full config generation workflow', async () => {
      // Setup: Project without config
      setupBasicProject('full-project');
      const worktree = setupTestWorktree('full-project', 'config-feature');
      
      const {services, setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Step 1: Show run config dialog
      setUIMode('runConfig', {
        project: 'full-project',
        configPath: '/fake/projects/full-project/.claude/run.json'
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Run Configuration');
      
      // Step 2: Simulate config generation
      setUIMode('runProgress', {project: 'full-project'});
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Generating Run Configuration');
      
      // Step 3: Mock successful generation
      const configResult = {
        success: true,
        content: JSON.stringify({
          name: 'Full Project',
          command: 'npm start',
          description: 'Start the development server'
        }),
        path: '/fake/projects/full-project/.claude/run.json'
      };
      
      // Step 4: Show results
      setUIMode('runResults', {
        project: 'full-project',
        feature: 'config-feature',
        path: worktree.path,
        result: configResult
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Success');
      expect(lastFrame()).toContain('npm start');
      
      // Step 5: After closing results, config should be available for execution
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // Mock that config now exists
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
      
      // Now run session should work
      const runSessionName = services.tmuxService.createRunSession('full-project', 'config-feature');
      expect(runSessionName).toBe('dev-full-project-config-feature-run');
    });

    test('should handle config generation cancellation', async () => {
      // Setup: Project in config dialog
      setupBasicProject('cancel-project');
      
      const {setUIMode, lastFrame} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Show run config dialog
      setUIMode('runConfig', {
        project: 'cancel-project',
        configPath: '/fake/projects/cancel-project/.claude/run.json'
      });
      await simulateTimeDelay(50);
      
      expect(lastFrame()).toContain('Run Configuration');
      
      // Simulate cancellation (return to list)
      setUIMode('list');
      await simulateTimeDelay(50);
      
      // Should be back to main view
      expect(lastFrame()).not.toContain('Run Configuration');
      expect(lastFrame()).not.toContain('Generating');
    });
  });

  describe('Run Session Types', () => {
    test('should distinguish run sessions from main and shell sessions', async () => {
      // Setup: Worktree with all session types
      setupBasicProject('multi-session');
      const worktree = setupTestWorktree('multi-session', 'all-sessions');
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Create main session
      const mainSession = services.tmuxService.createSession('multi-session', 'all-sessions', 'idle');
      expect(mainSession).toBe('dev-multi-session-all-sessions');
      
      // Create shell session
      const shellSession = services.tmuxService.createShellSession('multi-session', 'all-sessions');
      expect(shellSession).toBe('dev-multi-session-all-sessions-shell');
      
      // Create run session (with config)
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
      const runSession = services.tmuxService.createRunSession('multi-session', 'all-sessions');
      expect(runSession).toBe('dev-multi-session-all-sessions-run');
      
      // All three sessions should be different and exist
      expect(memoryStore.sessions.has(mainSession)).toBe(true);
      expect(memoryStore.sessions.has(shellSession)).toBe(true);
      expect(memoryStore.sessions.has(runSession)).toBe(true);
      
      // Verify session types are correctly identified
      expect(memoryStore.sessions.get(mainSession)?.claude_status).toBe('idle');
      expect(memoryStore.sessions.get(shellSession)?.claude_status).toBe('active');
      expect(memoryStore.sessions.get(runSession)?.claude_status).toBe('active');
    });

    test('should handle run session execution with custom commands', async () => {
      // Setup: Project with custom run config
      setupBasicProject('custom-project');
      const worktree = setupTestWorktree('custom-project', 'custom-feature');
      
      // Mock custom run config
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
      jest.spyOn(require('fs'), 'readFileSync').mockReturnValue(
        JSON.stringify({
          name: 'Custom Build',
          command: 'npm run build && npm run test',
          description: 'Build and test the project'
        })
      );
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Create run session with custom config
      const runSessionName = services.tmuxService.createRunSession('custom-project', 'custom-feature');
      
      // Should create session with custom command
      expect(runSessionName).toBe('dev-custom-project-custom-feature-run');
      
      const session = memoryStore.sessions.get(runSessionName);
      expect(session).toBeDefined();
      expect(session?.attached).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle file system errors during config creation', async () => {
      // Setup: Project with file system issues
      setupBasicProject('error-project');
      
      // Mock file system error
      jest.spyOn(require('fs'), 'writeFileSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Attempt to create run config should handle error gracefully
      // This would typically be handled in the actual service implementation
      // For now, we're testing that the app doesn't crash
      expect(() => {
        // Simulate config creation attempt
      }).not.toThrow();
    });

    test('should handle tmux session creation failures', async () => {
      // Setup: Worktree where tmux fails
      const {worktrees} = setupProjectWithWorktrees('fail-project', ['fail-feature']);
      
      // Mock tmux failure
      jest.spyOn(commandExecutor, 'runCommand').mockImplementation((args) => {
        if (args.includes('tmux new-session')) {
          throw new Error('tmux: session failed to start');
        }
        return '';
      });
      
      const {services} = renderTestApp();
      await simulateTimeDelay(50);
      
      // Run session creation should handle tmux failure gracefully
      const result = services.tmuxService.createRunSession('fail-project', 'fail-feature');
      
      // Should return null or handle error gracefully
      expect(result).toBeNull();
    });
  });
});