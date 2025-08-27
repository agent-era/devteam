import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { CacheService } from '../../src/services/CacheService.js';
import { PRStatus } from '../../src/models.js';

describe('Cache Integration Test', () => {
  let tempDir: string;
  let cacheService: CacheService;

  beforeEach(() => {
    // Create a real temporary directory for testing
    tempDir = path.join(__dirname, '../../tmp-test-cache');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cacheService = new CacheService(tempDir);
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    }
  });

  test('should maintain PR status methods through cache save/load cycle', () => {
    // Create PR statuses with different states
    const prStatuses: Record<string, PRStatus> = {
      '/merged/pr': new PRStatus({
        number: 123,
        state: 'MERGED',
        checks: 'passing',
        title: 'Merged feature'
      }),
      '/open/pr': new PRStatus({
        number: 456,
        state: 'OPEN',
        checks: 'passing',
        mergeable: 'MERGEABLE',
        title: 'Open feature'
      }),
      '/failing/pr': new PRStatus({
        number: 789,
        state: 'OPEN',
        checks: 'failing',
        title: 'Failing feature'
      }),
      '/no/pr': new PRStatus({
        number: null,
        state: null,
        checks: null
      })
    };

    // Save to cache
    cacheService.saveCache(prStatuses);

    // Verify file was created
    const cacheFile = path.join(tempDir, 'pr-status.json');
    expect(fs.existsSync(cacheFile)).toBe(true);

    // Load from cache
    const loadedPRs = cacheService.getCachedPRs();

    // Verify all PRs were loaded and have methods
    expect(Object.keys(loadedPRs)).toHaveLength(4);

    // Test merged PR
    const mergedPR = loadedPRs['/merged/pr'];
    expect(mergedPR).toBeInstanceOf(PRStatus);
    expect(mergedPR.is_merged).toBe(true);
    expect(mergedPR.is_open).toBe(false);
    expect(mergedPR.needs_attention).toBe(false);
    expect(mergedPR.number).toBe(123);

    // Test open PR ready to merge
    const openPR = loadedPRs['/open/pr'];
    expect(openPR).toBeInstanceOf(PRStatus);
    expect(openPR.is_merged).toBe(false);
    expect(openPR.is_open).toBe(true);
    expect(openPR.is_ready_to_merge).toBe(true);
    expect(openPR.needs_attention).toBe(false);

    // Test failing PR
    const failingPR = loadedPRs['/failing/pr'];
    expect(failingPR).toBeInstanceOf(PRStatus);
    expect(failingPR.is_merged).toBe(false);
    expect(failingPR.is_open).toBe(true);
    expect(failingPR.needs_attention).toBe(true);
    expect(failingPR.is_ready_to_merge).toBe(false);

    // Test no PR
    const noPR = loadedPRs['/no/pr'];
    expect(noPR).toBeInstanceOf(PRStatus);
    expect(noPR.is_merged).toBe(false);
    expect(noPR.is_open).toBe(false);
    expect(noPR.needs_attention).toBe(false);
    expect(noPR.is_ready_to_merge).toBe(false);
  });

  test('should handle cache clear operations', () => {
    // Save some data
    const prStatuses = {
      '/test/pr1': new PRStatus({ number: 1, state: 'OPEN' }),
      '/test/pr2': new PRStatus({ number: 2, state: 'MERGED' })
    };
    cacheService.saveCache(prStatuses);

    // Verify data exists
    let loaded = cacheService.getCachedPRs();
    expect(Object.keys(loaded)).toHaveLength(2);

    // Clear specific entry
    cacheService.clearCache('/test/pr1');
    loaded = cacheService.getCachedPRs();
    expect(Object.keys(loaded)).toHaveLength(1);
    expect(loaded['/test/pr2']).toBeDefined();

    // Clear all
    cacheService.clearCache();
    loaded = cacheService.getCachedPRs();
    expect(Object.keys(loaded)).toHaveLength(0);
  });

  test('should preserve additional PR properties', () => {
    const prWithAllProps = new PRStatus({
      number: 999,
      state: 'OPEN',
      checks: 'pending',
      loading: false,
      url: 'https://github.com/test/repo/pull/999',
      head: 'feature/awesome-feature',
      title: 'Add awesome feature with lots of details'
    });

    // Save and load
    cacheService.saveCache({ '/full/pr': prWithAllProps });
    const loaded = cacheService.getCachedPRs();
    const loadedPR = loaded['/full/pr'];

    // Verify all properties are preserved
    expect(loadedPR.number).toBe(999);
    expect(loadedPR.state).toBe('OPEN');
    expect(loadedPR.checks).toBe('pending');
    expect(loadedPR.loading).toBe(false);
    expect(loadedPR.url).toBe('https://github.com/test/repo/pull/999');
    expect(loadedPR.head).toBe('feature/awesome-feature');
    expect(loadedPR.title).toBe('Add awesome feature with lots of details');

    // Verify methods work with all properties
    expect(loadedPR.is_open).toBe(true);
    expect(loadedPR.is_merged).toBe(false);
    expect(loadedPR.needs_attention).toBe(false); // pending is not failing
    expect(loadedPR.is_ready_to_merge).toBe(false); // pending is not passing
  });
});