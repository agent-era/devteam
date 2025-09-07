/**
 * @jest-environment jsdom
 */
import {describe, test, expect, beforeEach, jest} from '@jest/globals';
import {renderHook} from '@testing-library/react';
import {usePagination, usePageSize} from '../../src/hooks/usePagination.js';
import {calculatePageSize, calculatePaginationInfo} from '../../src/utils/pagination.js';

// Mock terminal dimensions for testing
jest.mock('../../src/hooks/useTerminalDimensions.js', () => ({
  useTerminalDimensions: jest.fn(() => ({
    rows: 24,
    columns: 80
  }))
}));

import {useTerminalDimensions} from '../../src/hooks/useTerminalDimensions.js';
const mockUseTerminalDimensions = useTerminalDimensions as jest.MockedFunction<typeof useTerminalDimensions>;

describe('Pagination Integration Tests', () => {
  beforeEach(() => {
    mockUseTerminalDimensions.mockReturnValue({
      rows: 24,
      columns: 80
    });
  });

  describe('calculatePageSize utility', () => {
    test('should calculate page size for standard terminal', () => {
      const pageSize = calculatePageSize(24, 80);
      
      // With 24 rows, should account for:
      // - Header (1 line + 1 margin)
      // - Column header (1 line) 
      // - Footer + margin (2 lines)
      // = 19 available rows for content
      expect(pageSize).toBe(19);
    });

    test('should handle very small terminal', () => {
      const pageSize = calculatePageSize(5, 40);
      
      // Very small terminal should ensure at least 1 item
      expect(pageSize).toBeGreaterThanOrEqual(1);
      expect(pageSize).toBeLessThan(5); // Should be significantly reduced
    });

    test('should handle wide header text wrapping', () => {
      const pageSize = calculatePageSize(24, 30); // Very narrow
      
      // Should still calculate reasonable page size even with wrapped header
      expect(pageSize).toBeGreaterThanOrEqual(1);
      expect(pageSize).toBeLessThan(20);
    });

    test('should ensure minimum of 1 item per page', () => {
      const pageSizeVerySmall = calculatePageSize(3, 20);
      const pageSizeTiny = calculatePageSize(1, 10);
      
      expect(pageSizeVerySmall).toBe(1);
      expect(pageSizeTiny).toBe(1);
    });
  });

  describe('calculatePaginationInfo utility', () => {
    test('should handle single page scenario', () => {
      const info = calculatePaginationInfo(5, 0, 10);
      
      expect(info.totalPages).toBe(1);
      expect(info.currentPageStart).toBe(1);
      expect(info.currentPageEnd).toBe(5);
      expect(info.paginationText).toBe('  [5 items]');
    });

    test('should handle multiple pages correctly', () => {
      const info = calculatePaginationInfo(25, 1, 10);
      
      expect(info.totalPages).toBe(3);
      expect(info.currentPageStart).toBe(11);
      expect(info.currentPageEnd).toBe(20);
      expect(info.paginationText).toBe('  [Page 2/3: 11-20/25]');
    });

    test('should handle last partial page', () => {
      const info = calculatePaginationInfo(25, 2, 10);
      
      expect(info.totalPages).toBe(3);
      expect(info.currentPageStart).toBe(21);
      expect(info.currentPageEnd).toBe(25); // Should not exceed total items
      expect(info.paginationText).toBe('  [Page 3/3: 21-25/25]');
    });

    test('should handle edge cases', () => {
      // Empty list
      const emptyInfo = calculatePaginationInfo(0, 0, 10);
      expect(emptyInfo.totalPages).toBe(1);
      expect(emptyInfo.currentPageStart).toBe(1);
      expect(emptyInfo.currentPageEnd).toBe(0);

      // Single item
      const singleInfo = calculatePaginationInfo(1, 0, 10);
      expect(singleInfo.totalPages).toBe(1);
      expect(singleInfo.currentPageStart).toBe(1);
      expect(singleInfo.currentPageEnd).toBe(1);
    });
  });

  describe('usePagination hook', () => {
    test('should integrate terminal dimensions with pagination calculations', () => {
      const {result} = renderHook(() => usePagination(100, 2));
      
      // Should use mocked terminal dimensions (24x80)
      expect(result.current.pageSize).toBe(19); // From calculatePageSize
      expect(result.current.totalPages).toBe(6); // 100 items / 19 per page = 6 pages
      expect(result.current.currentPageStart).toBe(39); // Page 2 (0-indexed) * 19 + 1
      expect(result.current.currentPageEnd).toBe(57); // Page 2 end
      expect(result.current.paginationText).toContain('Page 3/6'); // Human readable page numbers
    });

    test('should adapt to different terminal sizes', () => {
      // Test with smaller terminal
      mockUseTerminalDimensions.mockReturnValue({
        rows: 12,
        columns: 60
      });

      const {result} = renderHook(() => usePagination(50, 0));
      
      // Should have smaller page size for smaller terminal
      expect(result.current.pageSize).toBeLessThan(19);
      expect(result.current.totalPages).toBeGreaterThan(6); // More pages due to smaller page size
    });

    test('should handle responsive pagination correctly', () => {
      // Test terminal size changes
      mockUseTerminalDimensions.mockReturnValue({
        rows: 30,
        columns: 120
      });

      const {result, rerender} = renderHook(
        ({totalItems, currentPage}) => usePagination(totalItems, currentPage),
        {initialProps: {totalItems: 100, currentPage: 0}}
      );

      const largeTerminalPageSize = result.current.pageSize;
      
      // Change to small terminal
      mockUseTerminalDimensions.mockReturnValue({
        rows: 10,
        columns: 40
      });

      rerender({totalItems: 100, currentPage: 0});

      expect(result.current.pageSize).toBeLessThan(largeTerminalPageSize);
      expect(result.current.totalPages).toBeGreaterThan(4); // More pages with smaller page size
    });
  });

  describe('usePageSize hook', () => {
    test('should return current page size based on terminal dimensions', () => {
      const {result} = renderHook(() => usePageSize());
      
      expect(result.current).toBe(19); // Based on 24x80 terminal
    });

    test('should update when terminal dimensions change', () => {
      const {result, rerender} = renderHook(() => usePageSize());
      
      expect(result.current).toBe(19);
      
      // Simulate terminal resize
      mockUseTerminalDimensions.mockReturnValue({
        rows: 15,
        columns: 80
      });
      
      rerender();
      
      expect(result.current).toBeLessThan(19); // Should be smaller for smaller terminal
      expect(result.current).toBeGreaterThanOrEqual(1); // But at least 1
    });
  });

  describe('Pagination behavior with real data scenarios', () => {
    test('should handle typical worktree list scenarios', () => {
      const scenarios = [
        {items: 5, expectedPages: 1, description: 'few items'},
        {items: 19, expectedPages: 1, description: 'exactly one page'},
        {items: 20, expectedPages: 2, description: 'just over one page'},
        {items: 50, expectedPages: 3, description: 'multiple pages'},
        {items: 100, expectedPages: 6, description: 'many pages'}
      ];

      scenarios.forEach(scenario => {
        const {result} = renderHook(() => usePagination(scenario.items, 0));
        
        expect(result.current.totalPages).toBe(scenario.expectedPages);
        expect(result.current.currentPageStart).toBe(1);
        expect(result.current.currentPageEnd).toBe(
          Math.min(scenario.items, result.current.pageSize)
        );
        
        // Pagination text should be appropriate
        if (scenario.expectedPages === 1) {
          expect(result.current.paginationText).toContain(`[${scenario.items} items]`);
        } else {
          expect(result.current.paginationText).toContain('Page 1/');
        }
      });
    });

    test('should handle navigation between pages correctly', () => {
      const totalItems = 50;
      
      // Test each page
      for (let page = 0; page < 3; page++) {
        const {result} = renderHook(() => usePagination(totalItems, page));
        
        expect(result.current.currentPageStart).toBe(page * 19 + 1);
        expect(result.current.currentPageEnd).toBe(
          Math.min((page + 1) * 19, totalItems)
        );
        
        // Verify page numbering (1-based for display)
        if (result.current.totalPages > 1) {
          expect(result.current.paginationText).toContain(`Page ${page + 1}/`);
        }
      }
    });

    test('should handle edge cases gracefully', () => {
      // Test with 0 items
      const {result: emptyResult} = renderHook(() => usePagination(0, 0));
      expect(emptyResult.current.totalPages).toBe(1);
      expect(emptyResult.current.paginationText).toContain('[0 items]');

      // Test with very large page number (should not crash)
      const {result: largePageResult} = renderHook(() => usePagination(10, 100));
      expect(largePageResult.current.currentPageStart).toBeDefined();
      expect(largePageResult.current.currentPageEnd).toBeDefined();
    });
  });

  describe('Terminal dimension integration', () => {
    test('should handle extreme terminal sizes', () => {
      const extremeCases = [
        {rows: 3, columns: 20, expectMinimal: true},
        {rows: 100, columns: 200, expectLarge: true},
        {rows: 1, columns: 1, expectMinimum: true}
      ];

      extremeCases.forEach(({rows, columns, expectMinimal, expectLarge, expectMinimum}) => {
        mockUseTerminalDimensions.mockReturnValue({rows, columns});
        
        const {result} = renderHook(() => usePagination(100, 0));
        
        if (expectMinimum) {
          expect(result.current.pageSize).toBe(1);
        } else if (expectMinimal) {
          expect(result.current.pageSize).toBeLessThan(10);
        } else if (expectLarge) {
          expect(result.current.pageSize).toBeGreaterThan(50);
        }
        
        // All cases should have valid pagination
        expect(result.current.totalPages).toBeGreaterThan(0);
        expect(result.current.currentPageStart).toBeGreaterThan(0);
        expect(result.current.currentPageEnd).toBeGreaterThanOrEqual(result.current.currentPageStart);
      });
    });
  });
});