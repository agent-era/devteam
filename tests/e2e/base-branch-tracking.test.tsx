import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {GitService} from '../../src/services/GitService.js';
import {findBaseBranch} from '../../src/shared/utils/gitHelpers.js';
import {BASE_BRANCH_CANDIDATES} from '../../src/constants.js';

// Mock all the utility modules
jest.mock('../../src/shared/utils/commandExecutor.js');
jest.mock('../../src/shared/utils/fileSystem.js');
jest.mock('node:fs');

import {runCommand, runCommandQuick} from '../../src/shared/utils/commandExecutor.js';
import {ensureDirectory} from '../../src/shared/utils/fileSystem.js';
import fs from 'node:fs';

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;
const mockRunCommandQuick = runCommandQuick as jest.MockedFunction<typeof runCommandQuick>;
const mockEnsureDirectory = ensureDirectory as jest.MockedFunction<typeof ensureDirectory>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Worktree Base Branch Tracking E2E', () => {
  let gitService: GitService;
  const testBasePath = '/test/projects';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockEnsureDirectory.mockImplementation(() => {});
    mockFs.existsSync = jest.fn();
    
    gitService = new GitService(testBasePath);
  });

  describe('createWorktree with base branch tracking', () => {
    test('should create worktree from main branch when available', async () => {
      // Mock findBaseBranch to return 'origin/main' by mocking runCommandQuick
      mockRunCommandQuick
        .mockReturnValueOnce('commit-hash-main'); // git rev-parse --verify origin/main succeeds
      
      // Mock the worktree creation command
      mockRunCommand.mockReturnValueOnce(''); // git worktree add command
      
      // Mock fs operations
      (mockFs.existsSync as jest.Mock)
        .mockReturnValueOnce(false) // Directory doesn't exist initially
        .mockReturnValueOnce(true);  // Directory exists after creation

      const result = gitService.createWorktree('test-project', 'new-feature');

      // Verify the git worktree command was called with base branch
      expect(mockRunCommand).toHaveBeenCalledWith(
        [
          'git', '-C', '/test/projects/test-project', 
          'worktree', 'add', 
          '/test/projects/test-project-branches/new-feature',
          '-b', 'feature/new-feature',
          'origin/main' // This is the key assertion - base branch should be specified
        ],
        {timeout: 30000}
      );

      expect(result).toBe(true);
    });

    test('should create worktree from master branch when main not available', async () => {
      // Mock findBaseBranch to return 'master' (main not available)
      mockRunCommand
        .mockReturnValueOnce('') // git rev-parse --verify origin/main (fails)
        .mockReturnValueOnce('commit-hash-master') // git rev-parse --verify origin/master
        .mockReturnValueOnce(''); // git worktree add command

      const mockFs = jest.requireMock('node:fs');
      mockFs.existsSync = jest.fn()
        .mockReturnValueOnce(false) // Directory doesn't exist initially  
        .mockReturnValueOnce(true);  // Directory exists after creation

      const result = gitService.createWorktree('test-project', 'new-feature');

      // Verify the git worktree command was called with master as base branch
      expect(mockRunCommand).toHaveBeenCalledWith(
        [
          'git', '-C', '/test/projects/test-project',
          'worktree', 'add',
          '/test/projects/test-project-branches/new-feature', 
          '-b', 'feature/new-feature',
          'origin/master' // Should use master when main not available
        ],
        {timeout: 30000}
      );

      expect(result).toBe(true);
    });

    test('should fallback to current behavior when no base branch found', async () => {
      // Mock findBaseBranch to return empty string (no base branch found)
      mockRunCommand
        .mockReturnValueOnce('') // git rev-parse --verify origin/main (fails)
        .mockReturnValueOnce('') // git rev-parse --verify origin/master (fails)  
        .mockReturnValueOnce('') // git rev-parse --verify origin/develop (fails)
        .mockReturnValueOnce('') // git rev-parse --verify main (fails)
        .mockReturnValueOnce('') // git rev-parse --verify master (fails)
        .mockReturnValueOnce('') // git rev-parse --verify develop (fails)
        .mockReturnValueOnce('fatal: no upstream') // git symbolic-ref refs/remotes/origin/HEAD (fails)
        .mockReturnValueOnce(''); // git worktree add command (fallback)

      const mockFs = jest.requireMock('node:fs');
      mockFs.existsSync = jest.fn()
        .mockReturnValueOnce(false) // Directory doesn't exist initially
        .mockReturnValueOnce(true);  // Directory exists after creation

      const result = gitService.createWorktree('test-project', 'new-feature');

      // Verify the git worktree command was called without base branch (fallback)
      expect(mockRunCommand).toHaveBeenCalledWith(
        [
          'git', '-C', '/test/projects/test-project',
          'worktree', 'add',
          '/test/projects/test-project-branches/new-feature',
          '-b', 'feature/new-feature'
          // No base branch parameter - this is the fallback behavior
        ],
        {timeout: 30000}
      );

      expect(result).toBe(true);
    });

    test('should use custom branch name when provided', async () => {
      // Mock findBaseBranch to return 'main'
      mockRunCommand
        .mockReturnValueOnce('commit-hash-main') // git rev-parse --verify origin/main
        .mockReturnValueOnce(''); // git worktree add command

      const mockFs = jest.requireMock('node:fs');
      mockFs.existsSync = jest.fn()
        .mockReturnValueOnce(false) // Directory doesn't exist initially
        .mockReturnValueOnce(true);  // Directory exists after creation

      const result = gitService.createWorktree('test-project', 'new-feature', 'custom/branch-name');

      // Verify custom branch name is used with base branch
      expect(mockRunCommand).toHaveBeenCalledWith(
        [
          'git', '-C', '/test/projects/test-project',
          'worktree', 'add', 
          '/test/projects/test-project-branches/new-feature',
          '-b', 'custom/branch-name',
          'origin/main'
        ],
        {timeout: 30000}
      );

      expect(result).toBe(true);
    });

    test('should handle worktree creation when directory already exists', async () => {
      const mockFs = jest.requireMock('node:fs');
      mockFs.existsSync = jest.fn()
        .mockReturnValueOnce(true); // Directory already exists

      const result = gitService.createWorktree('test-project', 'existing-feature');

      // Should return false and not attempt to create worktree
      expect(result).toBe(false);
      expect(mockRunCommand).not.toHaveBeenCalledWith(
        expect.arrayContaining(['worktree', 'add'])
      );
    });
  });

  describe('findBaseBranch utility function', () => {
    test('should prefer origin/main over other candidates', () => {
      mockRunCommand
        .mockReturnValueOnce('commit-hash-main'); // git rev-parse --verify origin/main

      const result = findBaseBranch('/test/repo', BASE_BRANCH_CANDIDATES);
      
      expect(result).toBe('origin/main');
      expect(mockRunCommand).toHaveBeenCalledWith([
        'git', '-C', '/test/repo', 'rev-parse', '--verify', 'origin/main'
      ]);
    });

    test('should fall back to origin/master when main not available', () => {
      mockRunCommand
        .mockReturnValueOnce('') // git rev-parse --verify origin/main (fails)
        .mockReturnValueOnce('commit-hash-master'); // git rev-parse --verify origin/master

      const result = findBaseBranch('/test/repo', BASE_BRANCH_CANDIDATES);
      
      expect(result).toBe('origin/master');
    });

    test('should use local branch when remote not available', () => {
      mockRunCommand
        .mockReturnValueOnce('') // git rev-parse --verify origin/main (fails)
        .mockReturnValueOnce('') // git rev-parse --verify origin/master (fails)
        .mockReturnValueOnce('') // git rev-parse --verify origin/develop (fails)
        .mockReturnValueOnce('commit-hash-main'); // git rev-parse --verify main

      const result = findBaseBranch('/test/repo', BASE_BRANCH_CANDIDATES);
      
      expect(result).toBe('main');
    });

    test('should use origin/HEAD as final fallback', () => {
      mockRunCommand
        .mockReturnValueOnce('') // All candidate checks fail
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('refs/remotes/origin/main'); // git symbolic-ref refs/remotes/origin/HEAD

      const result = findBaseBranch('/test/repo', BASE_BRANCH_CANDIDATES);
      
      expect(result).toBe('origin/main');
    });

    test('should return empty string when no base branch found', () => {
      mockRunCommand
        .mockReturnValue(''); // All commands fail

      const result = findBaseBranch('/test/repo', BASE_BRANCH_CANDIDATES);
      
      expect(result).toBe('');
    });
  });
});