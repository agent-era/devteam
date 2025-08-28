import {describe, test, expect} from '@jest/globals';
import {calculatePageSize, calculatePaginationInfo} from '../../src/utils/pagination.js';

describe('Terminal Dimensions Integration', () => {
  describe('Ink-based pagination utilities', () => {
    test('should calculate page size for various terminal sizes', () => {
      // Test cases: [rows, cols, expectedPageSize, description]
      const testCases = [
        [30, 100, 25, 'Wide terminal (100x30)'], // header = 1 line, reserved = 5, available = 25
        [24, 80, 19, 'Standard terminal (80x24)'], // header = 1 line, reserved = 5, available = 19
        [20, 60, 14, 'Small terminal (60x20)'], // header = 2 lines, reserved = 6, available = 14
        [50, 200, 45, 'Ultra-wide terminal (200x50)'], // header = 1 line, reserved = 5, available = 45
      ] as const;

      for (const [rows, cols, expected, description] of testCases) {
        const pageSize = calculatePageSize(rows, cols);
        expect(pageSize).toBe(expected);
        console.log(`✅ ${description}: ${pageSize} items per page`);
      }
    });

    test('should provide correct pagination info for different scenarios', () => {
      const pageSize = 25; // Simulating 30-row terminal
      
      // Test different data sizes
      const testCases = [
        {items: 10, page: 0, expected: '[10 items]'},
        {items: 25, page: 0, expected: '[25 items]'}, // Exactly one page
        {items: 50, page: 0, expected: '[Page 1/2: 1-25/50]'},
        {items: 50, page: 1, expected: '[Page 2/2: 26-50/50]'},
        {items: 100, page: 0, expected: '[Page 1/4: 1-25/100]'},
        {items: 100, page: 3, expected: '[Page 4/4: 76-100/100]'},
      ];

      for (const {items, page, expected} of testCases) {
        const info = calculatePaginationInfo(items, page, pageSize);
        expect(info.paginationText.trim()).toBe(expected);
      }
    });

    test('should handle edge cases gracefully', () => {
      // Very small terminal
      const smallPageSize = calculatePageSize(10, 40);
      expect(smallPageSize).toBeGreaterThanOrEqual(1); // Always at least 1
      
      // Very large terminal
      const largePageSize = calculatePageSize(100, 300);
      expect(largePageSize).toBeGreaterThan(50); // Should be quite large
      
      // Empty data
      const emptyInfo = calculatePaginationInfo(0, 0, 10);
      expect(emptyInfo.paginationText).toBe('  [0 items]');
    });
  });

  describe('Responsive behavior simulation', () => {
    test('should adapt to terminal size changes', () => {
      // Simulate terminal resize from small to large
      const scenarios = [
        {name: 'Mobile SSH (narrow)', rows: 20, cols: 60},
        {name: 'Laptop (standard)', rows: 30, cols: 100},
        {name: 'Desktop (wide)', rows: 50, cols: 150},
      ];

      const totalItems = 100;
      
      for (const {name, rows, cols} of scenarios) {
        const pageSize = calculatePageSize(rows, cols);
        const info = calculatePaginationInfo(totalItems, 0, pageSize);
        
        console.log(`📱 ${name}: ${pageSize} items/page → ${info.paginationText.trim()}`);
        
        // Verify sensible page sizes
        expect(pageSize).toBeGreaterThanOrEqual(1);
        expect(pageSize).toBeLessThanOrEqual(rows); // Can't exceed terminal height
        expect(info.totalPages).toBeGreaterThanOrEqual(1);
      }
    });

    test('should maintain consistency across different data sizes', () => {
      const pageSize = 20; // Fixed page size for testing
      const dataSizes = [1, 10, 20, 21, 50, 100, 1000];
      
      for (const size of dataSizes) {
        const info = calculatePaginationInfo(size, 0, pageSize);
        
        // Basic consistency checks
        expect(info.currentPageStart).toBeGreaterThanOrEqual(1);
        expect(info.currentPageEnd).toBeGreaterThanOrEqual(info.currentPageStart);
        expect(info.currentPageEnd).toBeLessThanOrEqual(size);
        expect(info.totalPages).toBeGreaterThanOrEqual(1);
        
        if (size <= pageSize) {
          expect(info.totalPages).toBe(1);
          expect(info.paginationText).toContain(`[${size} items]`);
        } else {
          expect(info.totalPages).toBeGreaterThan(1);
          expect(info.paginationText).toContain('[Page ');
        }
      }
    });
  });

  describe('Real-world usage patterns', () => {
    test('should handle typical Git worktree scenarios', () => {
      // Common scenarios in a dev environment
      const scenarios = [
        {name: 'Small project', worktrees: 5, terminal: [24, 80]},
        {name: 'Medium project', worktrees: 25, terminal: [30, 100]},
        {name: 'Large monorepo', worktrees: 100, terminal: [40, 120]},
      ];

      for (const {name, worktrees, terminal} of scenarios) {
        const [rows, cols] = terminal;
        const pageSize = calculatePageSize(rows, cols);
        const totalPages = Math.ceil(worktrees / pageSize);
        
        console.log(`🏢 ${name}: ${worktrees} worktrees, ${pageSize} per page, ${totalPages} pages`);
        
        // Verify reasonable pagination
        expect(pageSize).toBeGreaterThan(0);
        expect(totalPages).toBeGreaterThan(0);
        
        if (worktrees <= pageSize) {
          // Single page - no pagination needed
          const info = calculatePaginationInfo(worktrees, 0, pageSize);
          expect(info.paginationText).toContain(`[${worktrees} items]`);
        } else {
          // Multi-page - should have proper pagination
          const info = calculatePaginationInfo(worktrees, 0, pageSize);
          expect(info.paginationText).toContain('[Page 1/');
        }
      }
    });
  });
});