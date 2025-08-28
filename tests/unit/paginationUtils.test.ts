import {describe, test, expect, beforeEach, afterEach} from '@jest/globals';
import {calculatePageSize, calculatePaginationInfo} from '../../src/utils/pagination.js';

describe('Pagination Utilities', () => {
  describe('calculatePageSize', () => {
    test('should calculate page size for standard terminal', () => {
      // Test a standard terminal (80x24)
      const pageSize = calculatePageSize(24, 80);
      
      // With 80 columns, shortened header (63 chars) fits in 1 line
      // Reserved: 1 (header) + 4 (margins + column header + footer) = 5
      // Available: 24 - 5 = 19
      expect(pageSize).toBe(19);
    });

    test('should calculate page size for wide terminal', () => {
      // Test a wide terminal (120x30)
      const pageSize = calculatePageSize(30, 120);
      
      // With 120 columns, shortened header (63 chars) fits in 1 line
      // Reserved: 1 (header) + 4 (margins + column header + footer) = 5  
      // Available: 30 - 5 = 25
      expect(pageSize).toBe(25);
    });

    test('should calculate page size for narrow terminal', () => {
      // Test a narrow terminal (60x20)
      const pageSize = calculatePageSize(20, 60);
      
      // With 60 columns, shortened header (63 chars) takes 2 lines
      // Reserved: 2 (header) + 4 (margins + column header + footer) = 6
      // Available: 20 - 6 = 14
      expect(pageSize).toBe(14);
    });

    test('should handle very small terminal', () => {
      // Test a very small terminal
      const pageSize = calculatePageSize(10, 40);
      
      // Should always return at least 1
      expect(pageSize).toBeGreaterThanOrEqual(1);
    });

    test('should handle very short terminals with adaptive UI', () => {
      // Test 8-row terminal (threshold for adaptive UI)
      const eightRows = calculatePageSize(8, 40);
      // Header takes 2 lines (63/40), adaptive UI reserves max 4 lines, leaving 4 for content
      expect(eightRows).toBe(4);
      
      // Test 6-row terminal
      const sixRows = calculatePageSize(6, 30);  
      // Header takes 3 lines (63/30), adaptive UI reserves max 5 lines, leaving 1 for content
      expect(sixRows).toBe(1);
      
      // Test 4-row terminal
      const fourRows = calculatePageSize(4, 20);
      // Header takes 4 lines (63/20), adaptive UI reserves max 3 lines, leaving 1 for content
      expect(fourRows).toBe(1);
      
      // Test 3-row terminal (extreme case)
      const threeRows = calculatePageSize(3, 10);
      // Adaptive UI ensures at least 1 row for content
      expect(threeRows).toBe(1);
    });

    test('should use default values when called without parameters', () => {
      // Test default behavior
      const pageSize = calculatePageSize();
      
      // Should use defaults and calculate properly
      expect(pageSize).toBeGreaterThanOrEqual(1);
      expect(typeof pageSize).toBe('number');
    });

    test('should account for header text length', () => {
      const headerText = 'Enter attach, n new, a archive, x exec, d diff, s shell, q quit';
      
      // Test with different column widths
      const testCases = [
        {cols: 50, expectedHeaderLines: Math.ceil(headerText.length / 50)},
        {cols: 80, expectedHeaderLines: Math.ceil(headerText.length / 80)},
        {cols: 120, expectedHeaderLines: Math.ceil(headerText.length / 120)},
        {cols: 200, expectedHeaderLines: Math.ceil(headerText.length / 200)}
      ];

      for (const {cols, expectedHeaderLines} of testCases) {
        const pageSize = calculatePageSize(30, cols);
        const expectedReserved = expectedHeaderLines + 4; // header + margins + column + footer
        const expectedAvailable = 30 - expectedReserved;
        const expectedPageSize = Math.max(1, expectedAvailable);

        expect(pageSize).toBe(expectedPageSize);
      }
    });
  });

  describe('calculatePaginationInfo', () => {
    test('should calculate info for single page', () => {
      const result = calculatePaginationInfo(5, 0, 10);
      
      expect(result).toEqual({
        totalPages: 1,
        currentPageStart: 1,
        currentPageEnd: 5,
        paginationText: '  [5 items]'
      });
    });

    test('should calculate info for first page of multiple pages', () => {
      const result = calculatePaginationInfo(25, 0, 10);
      
      expect(result).toEqual({
        totalPages: 3,
        currentPageStart: 1,
        currentPageEnd: 10,
        paginationText: '  [Page 1/3: 1-10/25]'
      });
    });

    test('should calculate info for middle page', () => {
      const result = calculatePaginationInfo(25, 1, 10);
      
      expect(result).toEqual({
        totalPages: 3,
        currentPageStart: 11,
        currentPageEnd: 20,
        paginationText: '  [Page 2/3: 11-20/25]'
      });
    });

    test('should calculate info for last partial page', () => {
      const result = calculatePaginationInfo(25, 2, 10);
      
      expect(result).toEqual({
        totalPages: 3,
        currentPageStart: 21,
        currentPageEnd: 25,
        paginationText: '  [Page 3/3: 21-25/25]'
      });
    });

    test('should handle edge cases', () => {
      // Empty list
      let result = calculatePaginationInfo(0, 0, 10);
      expect(result.paginationText).toBe('  [0 items]');
      
      // Single item
      result = calculatePaginationInfo(1, 0, 10);
      expect(result.paginationText).toBe('  [1 items]');
      
      // Exact page boundary
      result = calculatePaginationInfo(20, 1, 10);
      expect(result).toEqual({
        totalPages: 2,
        currentPageStart: 11,
        currentPageEnd: 20,
        paginationText: '  [Page 2/2: 11-20/20]'
      });
    });

    test('should handle different page sizes', () => {
      // Small page size
      let result = calculatePaginationInfo(25, 0, 5);
      expect(result).toEqual({
        totalPages: 5,
        currentPageStart: 1,
        currentPageEnd: 5,
        paginationText: '  [Page 1/5: 1-5/25]'
      });

      // Large page size
      result = calculatePaginationInfo(25, 0, 50);
      expect(result).toEqual({
        totalPages: 1,
        currentPageStart: 1,
        currentPageEnd: 25,
        paginationText: '  [25 items]'
      });
    });

    test('should handle boundary conditions', () => {
      // Page at exact boundary
      let result = calculatePaginationInfo(20, 1, 10);
      expect(result.currentPageStart).toBe(11);
      expect(result.currentPageEnd).toBe(20);
      
      // Last valid page (25 items, 10 per page = 3 pages, so page 2 is last valid)
      result = calculatePaginationInfo(25, 2, 10);
      expect(result.currentPageStart).toBe(21);
      expect(result.currentPageEnd).toBe(25);
      expect(result.currentPageEnd).toBeGreaterThanOrEqual(result.currentPageStart);
    });

    test('should provide continuous numbering across pages', () => {
      const totalItems = 25;
      const pageSize = 10;
      
      // Test all pages to ensure continuous numbering
      const pages = [
        {page: 0, expectedStart: 1, expectedEnd: 10, expectedText: '[Page 1/3: 1-10/25]'},
        {page: 1, expectedStart: 11, expectedEnd: 20, expectedText: '[Page 2/3: 11-20/25]'},
        {page: 2, expectedStart: 21, expectedEnd: 25, expectedText: '[Page 3/3: 21-25/25]'}
      ];
      
      for (const {page, expectedStart, expectedEnd, expectedText} of pages) {
        const result = calculatePaginationInfo(totalItems, page, pageSize);
        expect(result.currentPageStart).toBe(expectedStart);
        expect(result.currentPageEnd).toBe(expectedEnd);
        expect(result.paginationText.trim()).toBe(expectedText);
      }
    });

    test('should handle continuous numbering with single-item pages (very short terminals)', () => {
      const totalItems = 10;
      const pageSize = 1; // Like on micro terminals
      
      // Test first few pages
      for (let page = 0; page < 3; page++) {
        const result = calculatePaginationInfo(totalItems, page, pageSize);
        const expectedItemNumber = page + 1;
        
        expect(result.currentPageStart).toBe(expectedItemNumber);
        expect(result.currentPageEnd).toBe(expectedItemNumber);
        expect(result.paginationText).toBe(`  [Page ${expectedItemNumber}/10: ${expectedItemNumber}-${expectedItemNumber}/10]`);
      }
    });
  });

  describe('Integration between utilities', () => {
    test('should work together for realistic scenarios', () => {
      // Test with realistic terminal size
      const pageSize = calculatePageSize(30, 100);
      const totalItems = 50;
      
      // Test first page
      let info = calculatePaginationInfo(totalItems, 0, pageSize);
      expect(info.currentPageStart).toBe(1);
      expect(info.currentPageEnd).toBe(Math.min(pageSize, totalItems));
      
      // Test last page
      const lastPage = Math.floor((totalItems - 1) / pageSize);
      info = calculatePaginationInfo(totalItems, lastPage, pageSize);
      expect(info.currentPageEnd).toBe(totalItems);
      expect(info.currentPageStart).toBeLessThanOrEqual(totalItems);
    });

    test('should maintain consistency across different terminal sizes', () => {
      const totalItems = 100;
      const terminalSizes = [
        {rows: 20, cols: 60},
        {rows: 30, cols: 100}, 
        {rows: 50, cols: 120}
      ];

      for (const {rows, cols} of terminalSizes) {
        const pageSize = calculatePageSize(rows, cols);
        const info = calculatePaginationInfo(totalItems, 0, pageSize);
        
        // Basic sanity checks
        expect(pageSize).toBeGreaterThan(0);
        expect(info.totalPages).toBeGreaterThan(0);
        expect(info.currentPageStart).toBe(1);
        expect(info.currentPageEnd).toBeLessThanOrEqual(totalItems);
        expect(info.currentPageEnd).toBeGreaterThanOrEqual(info.currentPageStart);
      }
    });
  });
});