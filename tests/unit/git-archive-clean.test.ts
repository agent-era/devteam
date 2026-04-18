import {describe, beforeEach, test, expect, jest} from '@jest/globals';

jest.mock('../../src/shared/utils/commandExecutor.js');
jest.mock('node:fs');

import {GitService} from '../../src/services/GitService.js';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';
import fs from 'node:fs';

const mockCommandExecutor = commandExecutor as jest.Mocked<typeof commandExecutor>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('GitService archiveWorktree cleaning', () => {
  let gitService: GitService;

  beforeEach(() => {
    jest.clearAllMocks();
    gitService = new GitService('/base/path');

    // Default mocks
    mockCommandExecutor.runCommandQuick.mockReturnValue('');
    mockFs.renameSync.mockImplementation((() => undefined) as any);
  });

  test('runs git clean -fdx before archiving', () => {
    const sourcePath = '/proj-branches/feature-x';
    const archivedDest = '/proj-archived/archived-123_feature-x';

    gitService.archiveWorktree('proj', sourcePath, archivedDest);

    // Ensure the clean command was called for all untracked files (-x)
    expect(mockCommandExecutor.runCommandQuick).toHaveBeenCalledWith(
      ['git', '-C', sourcePath, 'clean', '-fdx']
    );

    // Ensure the move was attempted
    expect(mockFs.renameSync).toHaveBeenCalledWith(sourcePath, archivedDest);

    // Ensure clean ran before rename (call order)
    const cleanCall = mockCommandExecutor.runCommandQuick.mock.invocationCallOrder[0];
    const renameCall = mockFs.renameSync.mock.invocationCallOrder[0];
    expect(cleanCall).toBeLessThan(renameCall);
  });

  test('continues archiving if clean fails', () => {
    const sourcePath = '/proj-branches/feature-y';
    const archivedDest = '/proj-archived/archived-456_feature-y';

    // Simulate clean throwing (e.g., git not available). Our code should ignore and continue.
    mockCommandExecutor.runCommandQuick.mockImplementation(() => { throw new Error('git failed'); });

    gitService.archiveWorktree('proj', sourcePath, archivedDest);

    // Rename should still be attempted even if clean throws
    expect(mockFs.renameSync).toHaveBeenCalledWith(sourcePath, archivedDest);
  });
});

describe('GitService getUntrackedNonIgnoredFiles', () => {
  let gitService: GitService;

  beforeEach(() => {
    jest.clearAllMocks();
    gitService = new GitService('/base/path');
  });

  test('returns list of untracked non-ignored files', () => {
    mockCommandExecutor.runCommandQuick.mockReturnValue('new-file.ts\nsrc/scratch.md\n');

    const files = gitService.getUntrackedNonIgnoredFiles('/proj-branches/feature-x');

    expect(mockCommandExecutor.runCommandQuick).toHaveBeenCalledWith(
      ['git', '-C', '/proj-branches/feature-x', 'ls-files', '--others', '--exclude-standard']
    );
    expect(files).toEqual(['new-file.ts', 'src/scratch.md']);
  });

  test('returns empty array when no untracked files', () => {
    mockCommandExecutor.runCommandQuick.mockReturnValue('');
    expect(gitService.getUntrackedNonIgnoredFiles('/proj-branches/feature-x')).toEqual([]);
  });

  test('returns empty array if git command throws', () => {
    mockCommandExecutor.runCommandQuick.mockImplementation(() => { throw new Error('git failed'); });
    expect(gitService.getUntrackedNonIgnoredFiles('/proj-branches/feature-x')).toEqual([]);
  });
});
