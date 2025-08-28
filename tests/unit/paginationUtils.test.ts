import {describe, test, expect} from '@jest/globals';
import {calculatePageSize, calculatePaginationInfo} from '../../src/utils/pagination.js';

describe('Pagination Utilities', () => {
  describe('calculatePageSize', () => {
    test('should calculate page size correctly for various terminal sizes', () => {
      const testCases = [
        {rows: 24, cols: 80, expected: 19, desc: 'Standard terminal'},
        {rows: 30, cols: 120, expected: 25, desc: 'Wide terminal'}, 
        {rows: 20, cols: 60, expected: 14, desc: 'Narrow terminal'},
        {rows: 8, cols: 40, expected: 4, desc: 'Short terminal with adaptive UI'}
      ];

      for (const {rows, cols, expected, desc} of testCases) {
        expect(calculatePageSize(rows, cols)).toBe(expected);
      }
    });

    test('should handle edge cases and defaults', () => {
      expect(calculatePageSize(3, 10)).toBe(1); // Minimum page size
      expect(calculatePageSize()).toBeGreaterThanOrEqual(1); // Default parameters
      expect(typeof calculatePageSize()).toBe('number');
    });
  });

  describe('calculatePaginationInfo', () => {
    test('should format single page correctly', () => {
      const result = calculatePaginationInfo(5, 0, 10);
      expect(result.paginationText).toBe('  [5 items]');
      expect(result.totalPages).toBe(1);
    });

    test('should calculate multi-page info correctly', () => {
      const testCases = [
        {items: 25, page: 0, pageSize: 10, expectedText: '[Page 1/3: 1-10/25]'},
        {items: 25, page: 1, pageSize: 10, expectedText: '[Page 2/3: 11-20/25]'},
        {items: 25, page: 2, pageSize: 10, expectedText: '[Page 3/3: 21-25/25]'}
      ];

      for (const {items, page, pageSize, expectedText} of testCases) {
        const result = calculatePaginationInfo(items, page, pageSize);
        expect(result.paginationText.trim()).toBe(expectedText);
      }
    });

    test('should handle edge cases', () => {
      expect(calculatePaginationInfo(0, 0, 10).paginationText).toBe('  [0 items]');
      expect(calculatePaginationInfo(1, 0, 1).paginationText).toBe('  [1 items]');
      
      // Boundary case
      const result = calculatePaginationInfo(20, 1, 10);
      expect(result.currentPageStart).toBe(11);
      expect(result.currentPageEnd).toBe(20);
    });
  });
});