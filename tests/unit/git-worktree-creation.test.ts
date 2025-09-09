import {describe, beforeEach, test, expect, jest} from '@jest/globals';

// Mock the modules we need
jest.mock('../../src/shared/utils/fileSystem.js');
jest.mock('../../src/shared/utils/commandExecutor.js');
jest.mock('../../src/shared/utils/gitHelpers.js');
jest.mock('node:fs');

import {GitService} from '../../src/services/GitService.js';
import * as fileSystem from '../../src/shared/utils/fileSystem.js';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';
import * as gitHelpers from '../../src/shared/utils/gitHelpers.js';
import fs from 'node:fs';

// Get typed mocks
const mockFs = fs as jest.Mocked<typeof fs>;
const mockFileSystem = fileSystem as jest.Mocked<typeof fileSystem>;
const mockCommandExecutor = commandExecutor as jest.Mocked<typeof commandExecutor>;
const mockGitHelpers = gitHelpers as jest.Mocked<typeof gitHelpers>;

describe('GitService worktree creation', () => {
  let gitService: GitService;

  beforeEach(() => {
    jest.clearAllMocks();
    gitService = new GitService('/test/base/path');
    
    // Set up default mock implementations
    mockFileSystem.ensureDirectory.mockImplementation(() => {});
    mockCommandExecutor.runCommand.mockReturnValue('');
    mockGitHelpers.findBaseBranch.mockReturnValue('origin/main');
    mockFs.existsSync.mockReturnValue(false);
    
    // Mock BASE_BRANCH_CANDIDATES
    // BASE_BRANCH_CANDIDATES constant is imported by GitService; no need to override here
  });

  test('should fetch from origin and create worktree from origin/main', () => {
    // Configure specific mocks for this test
    mockFs.existsSync
      .mockReturnValueOnce(false) // worktree doesn't exist initially
      .mockReturnValueOnce(true);  // worktree exists after creation
    mockGitHelpers.findBaseBranch.mockReturnValue('origin/main');

    const result = gitService.createWorktree('test-project', 'new-feature');

    // Verify fetch was called first
    expect(mockCommandExecutor.runCommand).toHaveBeenNthCalledWith(1,
      ['git', '-C', '/test/base/path/test-project', 'fetch', 'origin'],
      {timeout: 30000}
    );

    // Verify findBaseBranch was called
    expect(mockGitHelpers.findBaseBranch).toHaveBeenCalledWith(
      '/test/base/path/test-project',
      ['main', 'master', 'develop']
    );

    // Verify worktree creation with origin/main as base
    expect(mockCommandExecutor.runCommand).toHaveBeenNthCalledWith(2,
      ['git', '-C', '/test/base/path/test-project', 'worktree', 'add', 
       '/test/base/path/test-project-branches/new-feature', 
       '-b', 'new-feature', 'origin/main'],
      {timeout: 30000}
    );

    expect(result).toBe(true);
  });

  test('should use origin/master when main is not available', () => {
    mockFs.existsSync
      .mockReturnValueOnce(false) // worktree doesn't exist initially
      .mockReturnValueOnce(true);  // worktree exists after creation
    mockGitHelpers.findBaseBranch.mockReturnValue('origin/master');

    gitService.createWorktree('test-project', 'new-feature');

    // Verify worktree creation with origin/master as base
    expect(mockCommandExecutor.runCommand).toHaveBeenNthCalledWith(2,
      ['git', '-C', '/test/base/path/test-project', 'worktree', 'add', 
       '/test/base/path/test-project-branches/new-feature', 
       '-b', 'new-feature', 'origin/master'],
      {timeout: 30000}
    );
  });

  test('should handle local base branch by prefixing with origin/', () => {
    mockFs.existsSync
      .mockReturnValueOnce(false) // worktree doesn't exist initially
      .mockReturnValueOnce(true);  // worktree exists after creation
    mockGitHelpers.findBaseBranch.mockReturnValue('main'); // Local branch, no origin/ prefix

    gitService.createWorktree('test-project', 'new-feature');

    // Verify worktree creation with origin/main (prefixed)
    expect(mockCommandExecutor.runCommand).toHaveBeenNthCalledWith(2,
      ['git', '-C', '/test/base/path/test-project', 'worktree', 'add', 
       '/test/base/path/test-project-branches/new-feature', 
       '-b', 'new-feature', 'origin/main'],
      {timeout: 30000}
    );
  });

  test('should return false if no base branch is found', () => {
    mockFs.existsSync.mockReturnValue(false); // worktree doesn't exist
    mockGitHelpers.findBaseBranch.mockReturnValue(''); // No base branch found

    const result = gitService.createWorktree('test-project', 'new-feature');

    // Verify fetch was still called
    expect(mockCommandExecutor.runCommand).toHaveBeenCalledWith(
      ['git', '-C', '/test/base/path/test-project', 'fetch', 'origin'],
      {timeout: 30000}
    );

    // Verify worktree creation was NOT called due to missing base branch
    expect(mockCommandExecutor.runCommand).toHaveBeenCalledTimes(1); // Only fetch, no worktree add

    expect(result).toBe(false);
  });

  test('should use custom branch name when provided', () => {
    mockFs.existsSync
      .mockReturnValueOnce(false) // worktree doesn't exist initially
      .mockReturnValueOnce(true);  // worktree exists after creation
    mockGitHelpers.findBaseBranch.mockReturnValue('origin/main');

    gitService.createWorktree('test-project', 'new-feature', 'custom-branch-name');

    // Verify custom branch name is used
    expect(mockCommandExecutor.runCommand).toHaveBeenNthCalledWith(2,
      ['git', '-C', '/test/base/path/test-project', 'worktree', 'add', 
       '/test/base/path/test-project-branches/new-feature', 
       '-b', 'custom-branch-name', 'origin/main'],
      {timeout: 30000}
    );
  });

  test('should return false if worktree directory already exists', () => {
    mockFs.existsSync.mockReturnValue(true); // directory already exists

    const result = gitService.createWorktree('test-project', 'existing-feature');

    // Verify ensureDirectory was called but no git commands were executed
    expect(mockFileSystem.ensureDirectory).toHaveBeenCalled();
    expect(mockCommandExecutor.runCommand).not.toHaveBeenCalled();
    expect(mockGitHelpers.findBaseBranch).not.toHaveBeenCalled();
    
    expect(result).toBe(false);
  });
});
