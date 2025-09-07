import {PRStatusCacheService} from '../../src/services/PRStatusCacheService.js';
import {PRStatus} from '../../src/models.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('PRStatusCacheService', () => {
  let cacheService: PRStatusCacheService;
  let tempCacheFile: string;

  beforeEach(() => {
    cacheService = new PRStatusCacheService();
    
    // Use a temporary cache file for testing
    const tempDir = path.join(os.tmpdir(), 'pr-cache-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, {recursive: true});
    }
    tempCacheFile = path.join(tempDir, `cache-${Date.now()}.json`);
    
    // Override the cache file path for testing
    (cacheService as any).cacheFilePath = tempCacheFile;
    
    // Clear any existing cache data
    cacheService.clear();
  });

  afterEach(() => {
    // Clean up temp cache file
    try {
      if (fs.existsSync(tempCacheFile)) {
        fs.unlinkSync(tempCacheFile);
      }
    } catch {}
  });

  test('should store and retrieve PR status', () => {
    const worktreePath = '/test/path';
    const prStatus = new PRStatus({
      loadingStatus: 'exists',
      number: 123,
      state: 'OPEN',
      checks: 'passing',
      title: 'Test PR'
    });

    cacheService.set(worktreePath, prStatus);
    const retrieved = cacheService.get(worktreePath);

    expect(retrieved).toBeTruthy();
    expect(retrieved?.number).toBe(123);
    expect(retrieved?.state).toBe('OPEN');
    expect(retrieved?.checks).toBe('passing');
    expect(retrieved?.title).toBe('Test PR');
  });

  test('should return null for non-existent cache entry', () => {
    const retrieved = cacheService.get('/non/existent/path');
    expect(retrieved).toBeNull();
  });

  test('should respect TTL for different PR states', () => {
    const worktreePath = '/test/path';
    
    // Test merged PR (should have very long TTL)
    const mergedPR = new PRStatus({loadingStatus: 'exists', state: 'MERGED'});
    cacheService.set(worktreePath + '-merged', mergedPR);
    expect(cacheService.isValid(worktreePath + '-merged')).toBe(true);

    // Test failing PR (short TTL)
    const failingPR = new PRStatus({loadingStatus: 'exists', state: 'OPEN', checks: 'failing'});
    cacheService.set(worktreePath + '-failing', failingPR);
    expect(cacheService.isValid(worktreePath + '-failing')).toBe(true);

    // Test open PR (medium TTL)
    const openPR = new PRStatus({loadingStatus: 'exists', state: 'OPEN', checks: 'passing'});
    cacheService.set(worktreePath + '-open', openPR);
    expect(cacheService.isValid(worktreePath + '-open')).toBe(true);
  });

  test('should invalidate specific cache entry', () => {
    const worktreePath = '/test/path';
    const prStatus = new PRStatus({loadingStatus: 'exists', number: 123});

    cacheService.set(worktreePath, prStatus);
    expect(cacheService.get(worktreePath)).toBeTruthy();

    cacheService.invalidate(worktreePath);
    expect(cacheService.get(worktreePath)).toBeNull();
  });

  test('should clear all cache entries', () => {
    const path1 = '/test/path1';
    const path2 = '/test/path2';
    const prStatus = new PRStatus({loadingStatus: 'exists', number: 123});

    cacheService.set(path1, prStatus);
    cacheService.set(path2, prStatus);

    expect(cacheService.getCachedPaths()).toContain(path1);
    expect(cacheService.getCachedPaths()).toContain(path2);

    cacheService.clear();

    expect(cacheService.getCachedPaths()).toHaveLength(0);
    expect(cacheService.get(path1)).toBeNull();
    expect(cacheService.get(path2)).toBeNull();
  });

  test('should preserve PRStatus methods after JSON serialization', () => {
    const worktreePath = '/test/path';
    const prStatus = new PRStatus({
      loadingStatus: 'exists',
      state: 'MERGED',
      checks: 'passing',
      mergeable: 'MERGEABLE'
    });

    cacheService.set(worktreePath, prStatus);
    const retrieved = cacheService.get(worktreePath);

    expect(retrieved).toBeTruthy();
    expect(retrieved?.is_merged).toBe(true);
    expect(retrieved?.is_open).toBe(false);
    expect(retrieved?.needs_attention).toBe(false);
    expect(retrieved?.is_ready_to_merge).toBe(false); // merged PRs aren't ready to merge
  });

  test('should provide cache statistics', () => {
    const path1 = '/test/path1';
    const path2 = '/test/path2';
    const prStatus = new PRStatus({loadingStatus: 'exists', number: 123});

    cacheService.set(path1, prStatus);
    cacheService.set(path2, prStatus);

    const stats = cacheService.getStats();
    expect(stats.total).toBe(2);
    expect(stats.valid).toBe(2);
    expect(stats.expired).toBe(0);
  });

  test('should cleanup expired entries', () => {
    const worktreePath = '/test/path';
    const prStatus = new PRStatus({loadingStatus: 'exists', number: 123});

    cacheService.set(worktreePath, prStatus);
    expect(cacheService.getCachedPaths()).toContain(worktreePath);

    // Manually expire the entry by modifying timestamp
    const cache = (cacheService as any).cache;
    cache[worktreePath].timestamp = Date.now() - 1000000; // Very old timestamp

    expect(cacheService.isValid(worktreePath)).toBe(false);
    
    cacheService.cleanup();
    expect(cacheService.getCachedPaths()).not.toContain(worktreePath);
  });

  test('should invalidate multiple cache entries', () => {
    const paths = ['/test/path1', '/test/path2', '/test/path3'];
    const prStatus = new PRStatus({loadingStatus: 'exists', number: 123});

    // Cache entries for all paths
    paths.forEach(path => cacheService.set(path, prStatus));
    
    // Verify all entries are cached
    paths.forEach(path => {
      expect(cacheService.get(path)).toBeTruthy();
    });

    // Invalidate selected entries
    cacheService.invalidateMultiple([paths[0], paths[2]]);

    // Verify correct entries are invalidated
    expect(cacheService.get(paths[0])).toBeNull(); // invalidated
    expect(cacheService.get(paths[1])).toBeTruthy(); // still cached
    expect(cacheService.get(paths[2])).toBeNull(); // invalidated
  });
});