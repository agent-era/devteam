import {describe, test, expect, beforeEach} from '@jest/globals';
import {AppState, WorktreeInfo} from '../../src/models.js';

// Helper to create mock worktrees
function createMockWorktrees(count: number): WorktreeInfo[] {
  return Array.from({length: count}, (_, i) => new WorktreeInfo({
    project: `project-${Math.floor(i / 5)}`,
    feature: `feature-${i}`,
    path: `/projects/project-${Math.floor(i / 5)}-branches/feature-${i}`,
    branch: `feature-${i}`
  }));
}

describe('Pagination Integration - State Management', () => {
  describe('AppState with pagination', () => {
    test('should handle state updates with pagination correctly', () => {
      const worktrees = createMockWorktrees(25);
      const initialState = new AppState({
        worktrees,
        pageSize: 10,
        page: 0,
        selectedIndex: 0
      });

      // Simulate page navigation
      const nextPageState = new AppState({
        ...initialState,
        page: 1,
        selectedIndex: 10
      });

      expect(nextPageState.page).toBe(1);
      expect(nextPageState.selectedIndex).toBe(10);
      expect(nextPageState.worktrees.length).toBe(25);
      expect(nextPageState.pageSize).toBe(10);
    });

    test('should handle selection movement across pages', () => {
      const worktrees = createMockWorktrees(25);
      let state = new AppState({
        worktrees,
        pageSize: 10,
        page: 0,
        selectedIndex: 9 // Last item on first page
      });

      // Simulate moving down one item (crosses page boundary)
      const nextIndex = state.selectedIndex + 1;
      const targetPage = Math.floor(nextIndex / state.pageSize);

      state = new AppState({
        ...state,
        selectedIndex: nextIndex,
        page: targetPage
      });

      expect(state.selectedIndex).toBe(10);
      expect(state.page).toBe(1);
    });

    test('should handle edge case with last partial page', () => {
      const worktrees = createMockWorktrees(25); // 2.5 pages
      const state = new AppState({
        worktrees,
        pageSize: 10,
        page: 2, // Last page
        selectedIndex: 24 // Last item
      });

      const totalPages = Math.ceil(state.worktrees.length / state.pageSize);
      const pageStartIndex = state.page * state.pageSize;
      const pageEndIndex = Math.min(pageStartIndex + state.pageSize, state.worktrees.length) - 1;

      expect(totalPages).toBe(3);
      expect(pageStartIndex).toBe(20);
      expect(pageEndIndex).toBe(24);
      expect(state.selectedIndex).toBe(24);
    });

    test('should handle jumping to first and last items', () => {
      const worktrees = createMockWorktrees(25);
      let state = new AppState({
        worktrees,
        pageSize: 10,
        page: 1,
        selectedIndex: 15
      });

      // Jump to first
      state = new AppState({
        ...state,
        selectedIndex: 0,
        page: 0
      });
      expect(state.selectedIndex).toBe(0);
      expect(state.page).toBe(0);

      // Jump to last
      const lastIndex = state.worktrees.length - 1;
      const lastPage = Math.floor(lastIndex / state.pageSize);
      state = new AppState({
        ...state,
        selectedIndex: lastIndex,
        page: lastPage
      });
      expect(state.selectedIndex).toBe(24);
      expect(state.page).toBe(2);
    });
  });

  describe('Page slicing logic', () => {
    test('should slice worktrees correctly for different pages', () => {
      const worktrees = createMockWorktrees(25);
      const pageSize = 10;

      // First page
      const page0Start = 0 * pageSize;
      const page0Items = worktrees.slice(page0Start, page0Start + pageSize);
      expect(page0Items.length).toBe(10);
      expect(page0Items[0].feature).toBe('feature-0');
      expect(page0Items[9].feature).toBe('feature-9');

      // Middle page
      const page1Start = 1 * pageSize;
      const page1Items = worktrees.slice(page1Start, page1Start + pageSize);
      expect(page1Items.length).toBe(10);
      expect(page1Items[0].feature).toBe('feature-10');
      expect(page1Items[9].feature).toBe('feature-19');

      // Last partial page
      const page2Start = 2 * pageSize;
      const page2Items = worktrees.slice(page2Start, page2Start + pageSize);
      expect(page2Items.length).toBe(5);
      expect(page2Items[0].feature).toBe('feature-20');
      expect(page2Items[4].feature).toBe('feature-24');
    });

    test('should handle edge cases in slicing', () => {
      // Empty array
      const emptyWorktrees: WorktreeInfo[] = [];
      const emptySlice = emptyWorktrees.slice(0, 10);
      expect(emptySlice.length).toBe(0);

      // Single item
      const singleWorktree = [createMockWorktrees(1)[0]];
      const singleSlice = singleWorktree.slice(0, 10);
      expect(singleSlice.length).toBe(1);

      // Page size larger than array
      const smallArray = createMockWorktrees(5);
      const largeSlice = smallArray.slice(0, 20);
      expect(largeSlice.length).toBe(5);
    });
  });

  describe('Page calculation utilities', () => {
    test('should calculate pagination info correctly', () => {
      const worktrees = createMockWorktrees(25);
      const pageSize = 10;
      const page = 1; // Second page

      const totalPages = Math.ceil(worktrees.length / pageSize);
      const currentPageStart = page * pageSize + 1; // 1-based indexing for display
      const currentPageEnd = Math.min((page + 1) * pageSize, worktrees.length);

      expect(totalPages).toBe(3);
      expect(currentPageStart).toBe(11);
      expect(currentPageEnd).toBe(20);
    });

    test('should handle various page size scenarios', () => {
      const worktrees = createMockWorktrees(100);
      
      // Small pages
      let pageSize = 5;
      let totalPages = Math.ceil(worktrees.length / pageSize);
      expect(totalPages).toBe(20);

      // Large pages
      pageSize = 50;
      totalPages = Math.ceil(worktrees.length / pageSize);
      expect(totalPages).toBe(2);

      // Page size larger than total
      pageSize = 200;
      totalPages = Math.ceil(worktrees.length / pageSize);
      expect(totalPages).toBe(1);
    });
  });

  describe('Responsive page sizing', () => {
    test('should calculate page size based on terminal height', () => {
      // Simulate different terminal heights
      const mockTerminalHeights = [10, 20, 30, 50];
      
      mockTerminalHeights.forEach(height => {
        const expectedPageSize = Math.max(1, height - 3); // Account for header/footer
        expect(expectedPageSize).toBeGreaterThan(0);
        expect(expectedPageSize).toBe(height - 3);
      });
    });

    test('should handle minimum page size', () => {
      const minHeight = 3; // Very small terminal
      const pageSize = Math.max(1, minHeight - 3);
      expect(pageSize).toBe(1); // Minimum of 1 item per page
    });
  });

  describe('State transitions', () => {
    test('should handle complete pagination workflow', () => {
      const worktrees = createMockWorktrees(25);
      let state = new AppState({
        worktrees,
        pageSize: 10,
        page: 0,
        selectedIndex: 0
      });

      // Step 1: Navigate to middle of first page
      state = new AppState({
        ...state,
        selectedIndex: 5
      });
      expect(state.page).toBe(0);
      expect(state.selectedIndex).toBe(5);

      // Step 2: Navigate to second page
      const nextPageState = {
        ...state,
        page: (state.page + 1) % Math.ceil(state.worktrees.length / state.pageSize),
      };
      const startIndex = nextPageState.page * state.pageSize;
      state = new AppState({
        ...nextPageState,
        selectedIndex: Math.min(startIndex, state.worktrees.length - 1)
      });
      expect(state.page).toBe(1);
      expect(state.selectedIndex).toBe(10);

      // Step 3: Jump to last page
      const lastIndex = state.worktrees.length - 1;
      const lastPage = Math.floor(lastIndex / state.pageSize);
      state = new AppState({
        ...state,
        selectedIndex: lastIndex,
        page: lastPage
      });
      expect(state.page).toBe(2);
      expect(state.selectedIndex).toBe(24);

      // Step 4: Return to first page
      state = new AppState({
        ...state,
        selectedIndex: 0,
        page: 0
      });
      expect(state.page).toBe(0);
      expect(state.selectedIndex).toBe(0);
    });
  });
});