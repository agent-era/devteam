import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {GitService} from '../../src/services/GitService.js';
import * as utils from '../../src/utils.js';

// Mock the utils module
jest.mock('../../src/utils.js');

const mockedUtils = jest.mocked(utils);

describe('GitService worktree creation', () => {
  let gitService: GitService;

  beforeEach(() => {
    jest.clearAllMocks();
    gitService = new GitService('/test/base/path');
    
    // Mock filesystem operations
    mockedUtils.ensureDirectory = jest.fn();
  });

  test('should fetch from origin and create worktree from origin/main', () => {
    // Mock fs.existsSync to return false initially, then true after creation
    const fs = require('fs');
    jest.spyOn(fs, 'existsSync')
      .mockReturnValueOnce(false) // worktree doesn't exist initially
      .mockReturnValueOnce(true);  // worktree exists after creation
    
    // Mock findBaseBranch to return 'origin/main'
    mockedUtils.findBaseBranch = jest.fn().mockReturnValue('origin/main');
    
    // Mock runCommand to succeed
    mockedUtils.runCommand = jest.fn().mockReturnValue('');

    const result = gitService.createWorktree('test-project', 'new-feature');

    // Verify fetch was called first
    expect(mockedUtils.runCommand).toHaveBeenCalledWith(
      ['git', '-C', '/test/base/path/test-project', 'fetch', 'origin'],
      {timeout: 30000}
    );

    // Verify findBaseBranch was called
    expect(mockedUtils.findBaseBranch).toHaveBeenCalledWith(
      '/test/base/path/test-project',
      ['main', 'master', 'develop']
    );

    // Verify worktree creation with origin/main as base
    expect(mockedUtils.runCommand).toHaveBeenCalledWith(
      ['git', '-C', '/test/base/path/test-project', 'worktree', 'add', 
       '/test/base/path/test-project-branches/new-feature', 
       '-b', 'feature/new-feature', 'origin/main'],
      {timeout: 30000}
    );

    expect(result).toBe(true);
  });

  test('should use origin/master when main is not available', () => {
    // Mock fs.existsSync for this test
    const fs = require('fs');
    jest.spyOn(fs, 'existsSync')
      .mockReturnValueOnce(false) // worktree doesn't exist initially
      .mockReturnValueOnce(true);  // worktree exists after creation
    
    // Mock findBaseBranch to return 'origin/master'
    mockedUtils.findBaseBranch = jest.fn().mockReturnValue('origin/master');
    mockedUtils.runCommand = jest.fn().mockReturnValue('');

    gitService.createWorktree('test-project', 'new-feature');

    // Verify worktree creation with origin/master as base
    expect(mockedUtils.runCommand).toHaveBeenCalledWith(
      ['git', '-C', '/test/base/path/test-project', 'worktree', 'add', 
       '/test/base/path/test-project-branches/new-feature', 
       '-b', 'feature/new-feature', 'origin/master'],
      {timeout: 30000}
    );
  });

  test('should handle local base branch by prefixing with origin/', () => {
    // Mock fs.existsSync for this test
    const fs = require('fs');
    jest.spyOn(fs, 'existsSync')
      .mockReturnValueOnce(false) // worktree doesn't exist initially
      .mockReturnValueOnce(true);  // worktree exists after creation
    
    // Mock findBaseBranch to return local 'main' (no origin/ prefix)
    mockedUtils.findBaseBranch = jest.fn().mockReturnValue('main');
    mockedUtils.runCommand = jest.fn().mockReturnValue('');

    gitService.createWorktree('test-project', 'new-feature');

    // Verify worktree creation with origin/main (prefixed)
    expect(mockedUtils.runCommand).toHaveBeenCalledWith(
      ['git', '-C', '/test/base/path/test-project', 'worktree', 'add', 
       '/test/base/path/test-project-branches/new-feature', 
       '-b', 'feature/new-feature', 'origin/main'],
      {timeout: 30000}
    );
  });

  test('should return false if no base branch is found', () => {
    // Mock fs.existsSync for this test
    const fs = require('fs');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false); // worktree doesn't exist
    
    // Mock findBaseBranch to return empty string (no base branch found)
    mockedUtils.findBaseBranch = jest.fn().mockReturnValue('');
    mockedUtils.runCommand = jest.fn().mockReturnValue('');

    const result = gitService.createWorktree('test-project', 'new-feature');

    // Verify fetch was still called
    expect(mockedUtils.runCommand).toHaveBeenCalledWith(
      ['git', '-C', '/test/base/path/test-project', 'fetch', 'origin'],
      {timeout: 30000}
    );

    // Verify worktree creation was NOT called due to missing base branch
    expect(mockedUtils.runCommand).toHaveBeenCalledTimes(1); // Only fetch, no worktree add

    expect(result).toBe(false);
  });

  test('should use custom branch name when provided', () => {
    // Mock fs.existsSync for this test
    const fs = require('fs');
    jest.spyOn(fs, 'existsSync')
      .mockReturnValueOnce(false) // worktree doesn't exist initially
      .mockReturnValueOnce(true);  // worktree exists after creation
    
    mockedUtils.findBaseBranch = jest.fn().mockReturnValue('origin/main');
    mockedUtils.runCommand = jest.fn().mockReturnValue('');

    gitService.createWorktree('test-project', 'new-feature', 'custom-branch-name');

    // Verify custom branch name is used
    expect(mockedUtils.runCommand).toHaveBeenCalledWith(
      ['git', '-C', '/test/base/path/test-project', 'worktree', 'add', 
       '/test/base/path/test-project-branches/new-feature', 
       '-b', 'custom-branch-name', 'origin/main'],
      {timeout: 30000}
    );
  });

  test('should return false if worktree directory already exists', () => {
    // Mock fs.existsSync to return true (directory already exists)
    const fs = require('fs');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    mockedUtils.findBaseBranch = jest.fn();
    mockedUtils.runCommand = jest.fn();

    const result = gitService.createWorktree('test-project', 'existing-feature');

    // Verify no git commands were executed since the directory check happens first
    expect(mockedUtils.runCommand).not.toHaveBeenCalled();
    expect(mockedUtils.findBaseBranch).not.toHaveBeenCalled();
    
    expect(result).toBe(false);
  });
});