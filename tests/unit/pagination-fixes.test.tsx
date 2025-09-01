import {describe, test, expect} from '@jest/globals';
import {calculatePageSize, calculatePaginationInfo} from '../../src/utils/pagination.js';

describe('Pagination Fixes for Navigation Bug', () => {
  test('should never return invalid page size that could break rendering', () => {
    // Test various terminal sizes to ensure page size is always valid
    const testCases = [
      {rows: 1, cols: 10},
      {rows: 8, cols: 40}, // Very small terminal
      {rows: 24, cols: 80}, // Normal terminal
      {rows: 50, cols: 120}, // Large terminal
      {rows: -5, cols: 80}, // Invalid input
      {rows: 0, cols: 80}, // Zero rows
      {rows: 1000, cols: 1000}, // Very large terminal
    ];

    testCases.forEach(({rows, cols}) => {
      const pageSize = calculatePageSize(rows, cols);
      
      // Core safety checks that prevent blank screen bugs
      expect(pageSize).toBeGreaterThanOrEqual(1);
      expect(pageSize).toBeLessThanOrEqual(100);
      expect(Number.isInteger(pageSize)).toBe(true);
      expect(Number.isFinite(pageSize)).toBe(true);
    });
  });

  test('should handle edge cases in pagination info calculation', () => {
    // Test pagination info with various item counts and page sizes
    const testCases = [
      {totalItems: 0, page: 0, pageSize: 10},
      {totalItems: 1, page: 0, pageSize: 10},
      {totalItems: 10, page: 0, pageSize: 10},
      {totalItems: 15, page: 1, pageSize: 10},
      {totalItems: 100, page: 5, pageSize: 20},
    ];

    testCases.forEach(({totalItems, page, pageSize}) => {
      const paginationInfo = calculatePaginationInfo(totalItems, page, pageSize);
      
      // Ensure pagination info is always valid
      expect(paginationInfo.totalPages).toBeGreaterThanOrEqual(1);
      expect(paginationInfo.currentPageStart).toBeGreaterThanOrEqual(0);
      expect(paginationInfo.currentPageEnd).toBeGreaterThanOrEqual(0);
      expect(typeof paginationInfo.paginationText).toBe('string');
      expect(paginationInfo.paginationText.length).toBeGreaterThan(0);
    });
  });

  test('should handle very small terminals gracefully', () => {
    // Simulate the smallest possible terminals
    const verySmallCases = [
      {rows: 1, cols: 1},
      {rows: 2, cols: 2},
      {rows: 5, cols: 20},
    ];

    verySmallCases.forEach(({rows, cols}) => {
      const pageSize = calculatePageSize(rows, cols);
      
      // Even in very small terminals, we should get at least 1 item per page
      expect(pageSize).toBe(1);
    });
  });

  test('should maintain consistent behavior across terminal size changes', () => {
    // Simulate rapid terminal size changes that could trigger the navigation bug
    let prevPageSize = calculatePageSize(24, 80);
    
    const sizeChanges = [
      {rows: 24, cols: 80},
      {rows: 10, cols: 40},
      {rows: 30, cols: 100},
      {rows: 8, cols: 30},
      {rows: 24, cols: 80}, // Back to original
    ];

    sizeChanges.forEach(({rows, cols}) => {
      const pageSize = calculatePageSize(rows, cols);
      
      // Should always be valid regardless of previous size
      expect(pageSize).toBeGreaterThanOrEqual(1);
      expect(pageSize).toBeLessThanOrEqual(100);
      
      // Should be stable (deterministic for same input)
      const pageSize2 = calculatePageSize(rows, cols);
      expect(pageSize).toBe(pageSize2);
      
      prevPageSize = pageSize;
    });
  });
});