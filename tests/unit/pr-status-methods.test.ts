import { describe, expect, test } from '@jest/globals';
import { PRStatus } from '../../src/models.js';

describe('PRStatus methods after JSON serialization/deserialization', () => {
  test('should preserve methods when reconstructed from plain object', () => {
    // Simulate what happens when we load from JSON cache
    const plainObject = {
      number: 123,
      state: 'MERGED',
      checks: 'passing',
      loading: false,
      url: 'https://github.com/test/pr/123',
      head: 'feature-branch',
      title: 'Test PR'
    };

    // This is what the cache does: new PRStatus(plainObject)
    const reconstructedPR = new PRStatus(plainObject);

    // All methods should work correctly
    expect(reconstructedPR.number).toBe(123);
    expect(reconstructedPR.state).toBe('MERGED');
    expect(reconstructedPR.is_merged).toBe(true);
    expect(reconstructedPR.is_open).toBe(false);
    expect(reconstructedPR.needs_attention).toBe(false);
    expect(reconstructedPR.is_ready_to_merge).toBe(false); // Not open, so not ready to merge
  });

  test('should handle open PR with failing checks correctly', () => {
    const plainObject = {
      number: 456,
      state: 'OPEN',
      checks: 'failing',
      loading: false
    };

    const reconstructedPR = new PRStatus(plainObject);

    expect(reconstructedPR.is_merged).toBe(false);
    expect(reconstructedPR.is_open).toBe(true);
    expect(reconstructedPR.needs_attention).toBe(true); // failing checks
    expect(reconstructedPR.is_ready_to_merge).toBe(false); // not passing
  });

  test('should handle PR ready to merge correctly', () => {
    const plainObject = {
      number: 789,
      state: 'OPEN',
      checks: 'passing',
      loading: false,
      mergeable: 'MERGEABLE'
    };

    const reconstructedPR = new PRStatus(plainObject);

    expect(reconstructedPR.is_merged).toBe(false);
    expect(reconstructedPR.is_open).toBe(true);
    expect(reconstructedPR.needs_attention).toBe(false);
    expect(reconstructedPR.is_ready_to_merge).toBe(true); // open + passing + not loading
  });

  test('should handle PR that is loading correctly', () => {
    const plainObject = {
      number: 101,
      state: 'OPEN',
      checks: 'passing',
      loading: true // This should prevent it from being ready to merge
    };

    const reconstructedPR = new PRStatus(plainObject);

    expect(reconstructedPR.is_merged).toBe(false);
    expect(reconstructedPR.is_open).toBe(true);
    expect(reconstructedPR.needs_attention).toBe(false);
    expect(reconstructedPR.is_ready_to_merge).toBe(false); // loading prevents ready to merge
  });

  test('should handle empty/null PR correctly', () => {
    const plainObject = {
      number: null,
      state: null,
      checks: null,
      loading: false
    };

    const reconstructedPR = new PRStatus(plainObject);

    expect(reconstructedPR.is_merged).toBe(false);
    expect(reconstructedPR.is_open).toBe(false);
    expect(reconstructedPR.needs_attention).toBe(false);
    expect(reconstructedPR.is_ready_to_merge).toBe(false);
    expect(reconstructedPR.has_conflicts).toBe(false);
  });

  test('should handle PR with conflicts correctly', () => {
    const plainObject = {
      number: 555,
      state: 'OPEN',
      checks: 'passing',
      loading: false,
      mergeable: 'CONFLICTING'
    };

    const reconstructedPR = new PRStatus(plainObject);

    expect(reconstructedPR.is_merged).toBe(false);
    expect(reconstructedPR.is_open).toBe(true);
    expect(reconstructedPR.has_conflicts).toBe(true);
    expect(reconstructedPR.needs_attention).toBe(true); // conflicts should need attention
    expect(reconstructedPR.is_ready_to_merge).toBe(false); // conflicts prevent merging
  });

  test('should simulate full JSON round-trip like cache does', () => {
    // Start with a proper PRStatus
    const originalPR = new PRStatus({
      number: 999,
      state: 'OPEN',
      checks: 'passing',
      loading: false,
      mergeable: 'MERGEABLE',
      url: 'https://github.com/test/pr/999',
      title: 'Feature PR'
    });

    // Simulate JSON serialization (what happens when saving to cache)
    const serialized = JSON.stringify(originalPR);
    
    // Simulate JSON deserialization (what happens when loading from cache)
    const plainObject = JSON.parse(serialized);
    
    // This plain object won't have methods
    expect(plainObject.is_merged).toBeUndefined();
    expect(plainObject.is_open).toBeUndefined();
    
    // But when we reconstruct it (what CacheService does)
    const reconstructed = new PRStatus(plainObject);
    
    // All methods should work again
    expect(reconstructed.is_merged).toBe(false);
    expect(reconstructed.is_open).toBe(true);
    expect(reconstructed.needs_attention).toBe(false);
    expect(reconstructed.is_ready_to_merge).toBe(true);
    
    // Data should be preserved
    expect(reconstructed.number).toBe(999);
    expect(reconstructed.state).toBe('OPEN');
    expect(reconstructed.checks).toBe('passing');
    expect(reconstructed.url).toBe('https://github.com/test/pr/999');
  });
});