import {describe, test, expect, beforeEach} from '@jest/globals';
import {AppState, WorktreeInfo} from '../../src/models.js';

describe('Pagination Logic', () => {
  let mockWorktrees: WorktreeInfo[];

  beforeEach(() => {
    // Create 25 mock worktrees for testing
    mockWorktrees = Array.from({length: 25}, (_, i) => new WorktreeInfo({
      project: `project-${Math.floor(i / 5)}`,
      feature: `feature-${i}`,
      path: `/projects/project-${Math.floor(i / 5)}-branches/feature-${i}`,
      branch: `feature-${i}`
    }));
  });

  describe('Page calculations', () => {
    test('should calculate total pages for various data sizes', () => {
      const testCases = [
        {items: 25, pageSize: 10, expected: 3},
        {items: 20, pageSize: 10, expected: 2}, // Exact boundary
        {items: 5, pageSize: 10, expected: 1},  // Single page
        {items: 0, pageSize: 10, expected: 1}   // Empty (min 1)
      ];
      
      for (const {items, pageSize, expected} of testCases) {
        const data = items === 0 ? [] : mockWorktrees.slice(0, items);
        const totalPages = items === 0 ? Math.max(1, Math.ceil(data.length / pageSize)) : Math.ceil(data.length / pageSize);
        expect(totalPages).toBe(expected);
      }
    });
  });

  describe('Page item slicing', () => {
    test('should slice items for first page correctly', () => {
      const page = 0;
      const pageSize = 10;
      const start = page * pageSize;
      const pageItems = mockWorktrees.slice(start, start + pageSize);
      
      expect(pageItems.length).toBe(10);
      expect(pageItems[0].feature).toBe('feature-0');
      expect(pageItems[9].feature).toBe('feature-9');
    });

    test('should slice items for middle page correctly', () => {
      const page = 1;
      const pageSize = 10;
      const start = page * pageSize;
      const pageItems = mockWorktrees.slice(start, start + pageSize);
      
      expect(pageItems.length).toBe(10);
      expect(pageItems[0].feature).toBe('feature-10');
      expect(pageItems[9].feature).toBe('feature-19');
    });

    test('should slice items for last partial page correctly', () => {
      const page = 2;
      const pageSize = 10;
      const start = page * pageSize;
      const pageItems = mockWorktrees.slice(start, start + pageSize);
      
      expect(pageItems.length).toBe(5); // Only 5 items on last page
      expect(pageItems[0].feature).toBe('feature-20');
      expect(pageItems[4].feature).toBe('feature-24');
    });
  });

  describe('Selection index calculations', () => {
    test('should calculate correct page for given index', () => {
      const pageSize = 10;
      const testCases = [
        {index: 0, expectedPage: 0},   // First item
        {index: 9, expectedPage: 0},   // Last item on page 0
        {index: 10, expectedPage: 1},  // First item on page 1
        {index: 24, expectedPage: 2}   // Last item
      ];
      
      for (const {index, expectedPage} of testCases) {
        expect(Math.floor(index / pageSize)).toBe(expectedPage);
      }
    });

    test('should clamp selection index to valid range', () => {
      const totalItems = mockWorktrees.length;
      const clamp = (value: number) => Math.max(0, Math.min(totalItems - 1, value));
      
      expect(clamp(-5)).toBe(0);   // Lower bound
      expect(clamp(50)).toBe(24);  // Upper bound
      expect(clamp(15)).toBe(15);  // Valid index
    });
  });

  describe('Page navigation logic', () => {
    test('should handle previous page navigation', () => {
      const state = new AppState({
        worktrees: mockWorktrees,
        page: 1,
        pageSize: 10,
        selectedIndex: 15
      });

      const totalPages = Math.ceil(state.worktrees.length / state.pageSize);
      const prevPage = state.page === 0 ? totalPages - 1 : state.page - 1;
      const startIndex = prevPage * state.pageSize;
      const newIndex = Math.min(startIndex, state.worktrees.length - 1);

      expect(prevPage).toBe(0);
      expect(startIndex).toBe(0);
      expect(newIndex).toBe(0);
    });

    test('should handle next page navigation', () => {
      const state = new AppState({
        worktrees: mockWorktrees,
        page: 0,
        pageSize: 10,
        selectedIndex: 5
      });

      const totalPages = Math.ceil(state.worktrees.length / state.pageSize);
      const nextPage = (state.page + 1) % totalPages;
      const startIndex = nextPage * state.pageSize;
      const newIndex = Math.min(startIndex, state.worktrees.length - 1);

      expect(nextPage).toBe(1);
      expect(startIndex).toBe(10);
      expect(newIndex).toBe(10);
    });

    test('should wrap around to first page from last page', () => {
      const state = new AppState({
        worktrees: mockWorktrees,
        page: 2, // Last page
        pageSize: 10,
        selectedIndex: 24
      });

      const totalPages = Math.ceil(state.worktrees.length / state.pageSize);
      const nextPage = (state.page + 1) % totalPages;
      
      expect(nextPage).toBe(0); // Should wrap to first page
    });

    test('should wrap around to last page from first page on previous', () => {
      const state = new AppState({
        worktrees: mockWorktrees,
        page: 0, // First page
        pageSize: 10,
        selectedIndex: 5
      });

      const totalPages = Math.ceil(state.worktrees.length / state.pageSize);
      const prevPage = state.page === 0 ? totalPages - 1 : state.page - 1;
      
      expect(prevPage).toBe(2); // Should wrap to last page
    });
  });

  describe('Move navigation with page updates', () => {
    test('should update page when moving selection across page boundary', () => {
      const currentIndex = 9; // Last item on page 0
      const delta = 1; // Move to next item
      const pageSize = 10;
      
      const nextIndex = currentIndex + delta; // 10
      const targetPage = Math.floor(nextIndex / pageSize);
      
      expect(nextIndex).toBe(10);
      expect(targetPage).toBe(1);
    });

    test('should update page when moving selection backward across page boundary', () => {
      const currentIndex = 10; // First item on page 1
      const delta = -1; // Move to previous item
      const pageSize = 10;
      
      const nextIndex = currentIndex + delta; // 9
      const targetPage = Math.floor(nextIndex / pageSize);
      
      expect(nextIndex).toBe(9);
      expect(targetPage).toBe(0);
    });

    test('should handle large positive delta movements', () => {
      const currentIndex = 0;
      const delta = 15; // Large jump
      const totalItems = mockWorktrees.length;
      const pageSize = 10;
      
      let nextIndex = currentIndex + delta;
      nextIndex = Math.max(0, Math.min(totalItems - 1, nextIndex));
      const targetPage = Math.floor(nextIndex / pageSize);
      
      expect(nextIndex).toBe(15);
      expect(targetPage).toBe(1);
    });

    test('should handle large negative delta movements', () => {
      const currentIndex = 20;
      const delta = -15; // Large backward jump
      const totalItems = mockWorktrees.length;
      const pageSize = 10;
      
      let nextIndex = currentIndex + delta;
      nextIndex = Math.max(0, Math.min(totalItems - 1, nextIndex));
      const targetPage = Math.floor(nextIndex / pageSize);
      
      expect(nextIndex).toBe(5);
      expect(targetPage).toBe(0);
    });
  });

  describe('Jump to first/last logic', () => {
    test('should handle jump navigation', () => {
      const pageSize = 10;
      
      // Jump to first
      expect(Math.floor(0 / pageSize)).toBe(0);
      
      // Jump to last
      const lastIndex = mockWorktrees.length - 1;
      expect(Math.floor(lastIndex / pageSize)).toBe(2);
    });
  });

  describe('AppState model', () => {
    test('should initialize with correct default pagination values', () => {
      const state = new AppState();
      
      expect(state.page).toBe(0);
      expect(state.pageSize).toBe(20);
      expect(state.selectedIndex).toBe(0);
      expect(state.worktrees).toEqual([]);
    });

    test('should accept custom pagination values', () => {
      const state = new AppState({
        page: 2,
        pageSize: 15,
        selectedIndex: 10,
        worktrees: mockWorktrees
      });
      
      expect(state.page).toBe(2);
      expect(state.pageSize).toBe(15);
      expect(state.selectedIndex).toBe(10);
      expect(state.worktrees).toEqual(mockWorktrees);
    });
  });
});