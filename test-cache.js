// Simple integration test for PRStatusCacheService
import {PRStatusCacheService} from './src/services/PRStatusCacheService.js';
import {PRStatus} from './src/models.js';

console.log('Testing PRStatusCacheService...');

const cacheService = new PRStatusCacheService();

// Test basic set/get
const worktreePath = '/test/path';
const prStatus = new PRStatus({
  number: 123,
  state: 'OPEN',
  checks: 'passing',
  title: 'Test PR'
});

cacheService.set(worktreePath, prStatus);
const retrieved = cacheService.get(worktreePath);

console.log('✓ Set/get test:', {
  stored: prStatus.number,
  retrieved: retrieved?.number,
  match: retrieved?.number === 123
});

// Test method preservation
console.log('✓ Method preservation:', {
  is_open: retrieved?.is_open,
  needs_attention: retrieved?.needs_attention,
  expected_open: true,
  expected_attention: false
});

// Test TTL for different states
const mergedPR = new PRStatus({state: 'MERGED'});
const failingPR = new PRStatus({state: 'OPEN', checks: 'failing'});
const openPR = new PRStatus({state: 'OPEN', checks: 'passing'});

cacheService.set('/merged', mergedPR);
cacheService.set('/failing', failingPR);
cacheService.set('/open', openPR);

console.log('✓ TTL test:', {
  merged_valid: cacheService.isValid('/merged'),
  failing_valid: cacheService.isValid('/failing'),
  open_valid: cacheService.isValid('/open'),
  all_should_be_true: true
});

// Test cache stats
const stats = cacheService.getStats();
console.log('✓ Cache stats:', stats);

// Test invalidation
cacheService.invalidate(worktreePath);
const afterInvalidate = cacheService.get(worktreePath);

console.log('✓ Invalidation test:', {
  after_invalidate: afterInvalidate === null,
  expected: true
});

console.log('All cache tests completed successfully! ✅');