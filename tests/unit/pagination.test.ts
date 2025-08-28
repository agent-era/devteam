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
    test('should calculate total pages correctly', () => {
      const pageSize = 10;
      const totalPages = Math.ceil(mockWorktrees.length / pageSize);
      expect(totalPages).toBe(3); // 25 items / 10 per page = 3 pages
    });

    test('should handle edge case with exact page boundary', () => {
      const worktrees = mockWorktrees.slice(0, 20); // Exactly 20 items
      const pageSize = 10;
      const totalPages = Math.ceil(worktrees.length / pageSize);
      expect(totalPages).toBe(2); // 20 items / 10 per page = 2 pages
    });

    test('should handle single page', () => {
      const worktrees = mockWorktrees.slice(0, 5); // 5 items
      const pageSize = 10;
      const totalPages = Math.ceil(worktrees.length / pageSize);
      expect(totalPages).toBe(1);
    });

    test('should handle empty list', () => {
      const worktrees: WorktreeInfo[] = [];
      const pageSize = 10;
      const totalPages = Math.max(1, Math.ceil(worktrees.length / pageSize));
      expect(totalPages).toBe(1);
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
      
      expect(Math.floor(0 / pageSize)).toBe(0); // First item -> page 0
      expect(Math.floor(9 / pageSize)).toBe(0); // Last item on page 0
      expect(Math.floor(10 / pageSize)).toBe(1); // First item on page 1
      expect(Math.floor(19 / pageSize)).toBe(1); // Last item on page 1
      expect(Math.floor(24 / pageSize)).toBe(2); // Last item on page 2
    });

    test('should clamp selection index to valid range', () => {
      const totalItems = mockWorktrees.length;
      
      // Test lower bound
      expect(Math.max(0, Math.min(totalItems - 1, -5))).toBe(0);
      
      // Test upper bound
      expect(Math.max(0, Math.min(totalItems - 1, 50))).toBe(24);
      
      // Test valid index
      expect(Math.max(0, Math.min(totalItems - 1, 15))).toBe(15);
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
    test('should jump to first item', () => {
      const newIndex = 0;
      const targetPage = Math.floor(newIndex / 10);
      
      expect(newIndex).toBe(0);
      expect(targetPage).toBe(0);
    });

    test('should jump to last item', () => {
      const totalItems = mockWorktrees.length;
      const newIndex = totalItems - 1;
      const targetPage = Math.floor(newIndex / 10);
      
      expect(newIndex).toBe(24);
      expect(targetPage).toBe(2);
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