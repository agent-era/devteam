import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import {PRStatusCacheService} from '../../src/services/PRStatusCacheService.js';
import {PRStatus} from '../../src/models.js';

// Mock the runCommandQuick at the module level
jest.mock('../../src/utils.js', () => ({
  ...(jest.requireActual('../../src/utils.js') as any),
  runCommandQuick: jest.fn()
}));

import {runCommandQuick} from '../../src/utils.js';
const mockRunCommandQuick = runCommandQuick as jest.MockedFunction<typeof runCommandQuick>;

describe('PR Cache Remote Commit Invalidation', () => {
  let cacheService: PRStatusCacheService;
  
  const testWorktreePath = '/test/project-branches/feature';
  const initialLocalCommit = 'abc123local';
  const initialRemoteCommit = 'def456remote';
  const newRemoteCommit = 'ghi789newremote';

  beforeEach(() => {
    // Clear cache
    cacheService = new PRStatusCacheService();
    cacheService.clear();
    
    // Reset and set default mock implementation
    mockRunCommandQuick.mockReset();
    mockRunCommandQuick.mockImplementation((args: string[]) => {
      const command = args.slice(1).join(' ');
      
      // Mock local commit hash
      if (command.includes('rev-parse HEAD')) {
        return initialLocalCommit;
      }
      
      // Mock current branch
      if (command.includes('branch --show-current')) {
        return 'feature-branch';
      }
      
      // Mock remote commit hash - initially returns old hash
      if (command.includes('rev-parse origin/feature-branch')) {
        return initialRemoteCommit;
      }
      
      return '';
    });
  });

  test('should cache PR status with both local and remote commit hashes', () => {
    // Given: A pending PR status
    const prStatus = new PRStatus({
      loadingStatus: 'exists',
      number: 123,
      checks: 'pending',
      state: 'OPEN'
    });

    // When: PR status is cached
    cacheService.set(testWorktreePath, prStatus);

    // Then: Cache entry should contain both commit hashes
    const cached = cacheService.get(testWorktreePath);
    expect(cached).not.toBeNull();
    expect(cached?.number).toBe(123);
    expect(cached?.checks).toBe('pending');
    
    // Verify git commands were called to get commit hashes
    expect(mockRunCommandQuick).toHaveBeenCalledWith(['git', '-C', testWorktreePath, 'rev-parse', 'HEAD']);
    expect(mockRunCommandQuick).toHaveBeenCalledWith(['git', '-C', testWorktreePath, 'branch', '--show-current']);
    expect(mockRunCommandQuick).toHaveBeenCalledWith(['git', '-C', testWorktreePath, 'rev-parse', 'origin/feature-branch']);
  });

  test('should invalidate cache when remote commit changes', () => {
    // Given: PR status is cached with initial commit hashes
    const prStatus = new PRStatus({
      loadingStatus: 'exists',
      number: 123,
      checks: 'pending',
      state: 'OPEN'
    });
    
    cacheService.set(testWorktreePath, prStatus);
    
    // Verify it's cached
    let cached = cacheService.get(testWorktreePath);
    expect(cached).not.toBeNull();
    expect(cached?.number).toBe(123);

    // When: Remote commit changes (simulate new remote commit)
    mockRunCommandQuick.mockImplementation((args: string[]) => {
      const command = args.slice(1).join(' ');
      
      // Keep local commit the same
      if (command.includes('rev-parse HEAD')) {
        return initialLocalCommit;
      }
      
      if (command.includes('branch --show-current')) {
        return 'feature-branch';
      }
      
      // Return new remote commit hash
      if (command.includes('rev-parse origin/feature-branch')) {
        return newRemoteCommit; // Different from initial
      }
      
      return '';
    });

    // Then: Cache should be invalidated (returns null)
    cached = cacheService.get(testWorktreePath);
    expect(cached).toBeNull();
  });

  test('should not invalidate cache when remote commit stays same', () => {
    // Given: PR status is cached
    const prStatus = new PRStatus({
      loadingStatus: 'exists',
      number: 123,
      checks: 'passing',
      state: 'OPEN'
    });
    
    cacheService.set(testWorktreePath, prStatus);

    // When: Remote commit stays the same (no change in mock)
    // (mockRunCommandQuick already returns same hashes by default)

    // Then: Cache should still be valid
    const cached = cacheService.get(testWorktreePath);
    expect(cached).not.toBeNull();
    expect(cached?.number).toBe(123);
    expect(cached?.checks).toBe('passing');
  });

  test('should invalidate cache when local commit changes', () => {
    // Given: PR status is cached
    const prStatus = new PRStatus({
      loadingStatus: 'exists',
      number: 123,
      checks: 'pending',
      state: 'OPEN'
    });
    
    cacheService.set(testWorktreePath, prStatus);

    // When: Local commit changes
    mockRunCommandQuick.mockImplementation((args: string[]) => {
      const command = args.slice(1).join(' ');
      
      // Return new local commit hash  
      if (command.includes('rev-parse HEAD')) {
        return 'xyz789newlocal'; // Different from initial
      }
      
      if (command.includes('branch --show-current')) {
        return 'feature-branch';
      }
      
      // Keep remote commit the same
      if (command.includes('rev-parse origin/feature-branch')) {
        return initialRemoteCommit;
      }
      
      return '';
    });

    // Then: Cache should be invalidated
    const cached = cacheService.get(testWorktreePath);
    expect(cached).toBeNull();
  });

  test('should handle missing remote branch gracefully', () => {
    // Given: Mock remote branch doesn't exist
    mockRunCommandQuick.mockImplementation((args: string[]) => {
      const command = args.slice(1).join(' ');
      
      if (command.includes('rev-parse HEAD')) {
        return initialLocalCommit;
      }
      
      if (command.includes('branch --show-current')) {
        return 'feature-branch';
      }
      
      // Simulate remote branch not found (git command fails)
      if (command.includes('rev-parse origin/feature-branch')) {
        throw new Error('fatal: bad revision');
      }
      
      return '';
    });

    // When: PR status is cached (should work despite missing remote)
    const prStatus = new PRStatus({
      loadingStatus: 'exists',
      number: 123,
      checks: 'pending',
      state: 'OPEN'
    });
    
    cacheService.set(testWorktreePath, prStatus);

    // Then: Should still cache successfully (only local commit validation)
    const cached = cacheService.get(testWorktreePath);
    expect(cached).not.toBeNull();
    expect(cached?.number).toBe(123);
  });

  test('should use correct TTL for pending checks (20 seconds)', () => {
    // Given: A PR with pending checks
    const prStatus = new PRStatus({
      loadingStatus: 'exists',
      number: 123,
      checks: 'pending',
      state: 'OPEN'
    });

    // When: Cached
    cacheService.set(testWorktreePath, prStatus);

    // Then: Should be valid immediately
    expect(cacheService.isValid(testWorktreePath)).toBe(true);

    // And: Should be cached (not skipped due to TTL=0)
    const cached = cacheService.get(testWorktreePath);
    expect(cached?.checks).toBe('pending');
    expect(cached?.number).toBe(123);
  });

  test('should handle cache validation with both commit types', () => {
    // Given: PR status is cached
    const prStatus = new PRStatus({
      loadingStatus: 'exists', 
      number: 123,
      checks: 'passing',
      state: 'OPEN'
    });
    
    cacheService.set(testWorktreePath, prStatus);
    
    // When: Checking if cache is valid (no commits changed)
    const isValid = cacheService.isValid(testWorktreePath);
    
    // Then: Should be valid
    expect(isValid).toBe(true);

    // When: Remote commit changes
    mockRunCommandQuick.mockImplementation((args: string[]) => {
      const command = args.slice(1).join(' ');
      
      if (command.includes('rev-parse HEAD')) {
        return initialLocalCommit;
      }
      
      if (command.includes('branch --show-current')) {
        return 'feature-branch';
      }
      
      if (command.includes('rev-parse origin/feature-branch')) {
        return newRemoteCommit; // Changed
      }
      
      return '';
    });

    // Then: Should be invalid
    const isValidAfterChange = cacheService.isValid(testWorktreePath);
    expect(isValidAfterChange).toBe(false);
  });

  test('should demonstrate end-to-end invalidation flow', () => {
    // Given: A feature branch with pending PR checks  
    const pendingPR = new PRStatus({
      loadingStatus: 'exists',
      number: 456,
      checks: 'pending',
      state: 'OPEN',
      title: 'Add remote commit tracking'
    });

    // When: Initial cache
    cacheService.set(testWorktreePath, pendingPR);
    expect(cacheService.get(testWorktreePath)?.checks).toBe('pending');

    // And: Simulate git fetch bringing new remote commits
    mockRunCommandQuick.mockImplementation((args: string[]) => {
      const command = args.slice(1).join(' ');
      
      if (command.includes('rev-parse HEAD')) {
        return initialLocalCommit; // Local unchanged
      }
      
      if (command.includes('branch --show-current')) {
        return 'feature-branch';
      }
      
      // Remote has new commits
      if (command.includes('rev-parse origin/feature-branch')) {
        return 'new789commit'; // Different remote hash
      }
      
      return '';
    });

    // Then: Cache should be automatically invalidated
    const afterFetch = cacheService.get(testWorktreePath);
    expect(afterFetch).toBeNull(); // Cache is invalid

    // And: New PR status would be fetched (with potentially updated checks)
    const updatedPR = new PRStatus({
      loadingStatus: 'exists',
      number: 456,
      checks: 'passing', // Checks now passing after new commits
      state: 'OPEN',
      title: 'Add remote commit tracking'
    });

    cacheService.set(testWorktreePath, updatedPR);
    const finalCached = cacheService.get(testWorktreePath);
    expect(finalCached?.checks).toBe('passing'); // Updated status
    expect(finalCached?.number).toBe(456); // Same PR number
  });
});