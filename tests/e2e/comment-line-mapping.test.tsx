import {describe, test, expect, beforeEach, jest} from '@jest/globals';
import {computeUnifiedPerFileIndices, computeSideBySidePerFileIndices, UnifiedDiffLine, SideBySideRow} from '../../src/shared/utils/diffLineIndex.js';
import {CommentStore} from '../../src/models.js';

describe('Comment line mapping and indexing', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('unified view line mapping', () => {
    test('maps only added/context to current line numbers', () => {
      const lines: UnifiedDiffLine[] = [
        {type: 'header', text: '📁 src/a.ts', fileName: 'src/a.ts', headerType: 'file'},
        {type: 'removed', text: 'old', fileName: 'src/a.ts'},
        {type: 'added', text: 'new', fileName: 'src/a.ts'},
        {type: 'context', text: 'same', fileName: 'src/a.ts'},
        {type: 'removed', text: 'old2', fileName: 'src/a.ts'},
      ];
      const map = computeUnifiedPerFileIndices(lines);
      
      expect(map[0]).toBeUndefined(); // header
      expect(map[1]).toBeUndefined(); // removed line
      expect(map[2]).toBe(0); // first current line (added)
      expect(map[3]).toBe(1); // second current line (context)
      expect(map[4]).toBeUndefined(); // removed line
    });

    test('handles file headers correctly', () => {
      const lines: UnifiedDiffLine[] = [
        {type: 'header', text: '📁 src/file.ts', fileName: 'src/file.ts', headerType: 'file'},
        {type: 'header', text: '  ▼ @@ -1,3 +1,3 @@', fileName: 'src/file.ts', headerType: 'hunk'},
        {type: 'context', text: 'line 1', fileName: 'src/file.ts'},
      ];
      const map = computeUnifiedPerFileIndices(lines);
      
      expect(map[0]).toBeUndefined(); // file header gets undefined
      expect(map[1]).toBeUndefined(); // hunk header gets undefined  
      expect(map[2]).toBe(0); // first content line gets index 0
    });
  });

  describe('side-by-side view line mapping', () => {
    test('maps by right side only', () => {
      const rows: SideBySideRow[] = [
        { left: {type: 'header', text: '📁 src/b.ts', fileName: 'src/b.ts', headerType: 'file'}, right: {type: 'header', text: '📁 src/b.ts', fileName: 'src/b.ts', headerType: 'file'}, lineIndex: 0 },
        { left: {type: 'removed', text: 'old', fileName: 'src/b.ts'}, right: {type: 'added', text: 'new', fileName: 'src/b.ts'}, lineIndex: 1 },
        { left: {type: 'removed', text: 'old2', fileName: 'src/b.ts'}, right: {type: 'empty', text: '', fileName: 'src/b.ts'}, lineIndex: 2 },
        { left: {type: 'context', text: 'same', fileName: 'src/b.ts'}, right: {type: 'context', text: 'same', fileName: 'src/b.ts'}, lineIndex: 3 },
      ];
      const map = computeSideBySidePerFileIndices(rows);
      
      expect(map[0]).toBeUndefined(); // header
      expect(map[1]).toBe(0); // paired removed/added maps to right side index 0
      expect(map[2]).toBeUndefined(); // removed-only (no right) maps to undefined
      expect(map[3]).toBe(1); // context with right maps to index 1
    });

    test('prefers right-side filename', () => {
      const rows: SideBySideRow[] = [
        { left: {type: 'removed', text: 'old', fileName: 'left.ts'}, right: {type: 'added', text: 'new', fileName: 'right.ts'}, lineIndex: 0 },
      ];
      const map = computeSideBySidePerFileIndices(rows);
      
      expect(map[0]).toBe(0); // Uses right-side filename for mapping
    });
  });

  describe('comment store line index handling', () => {
    test('properly handles undefined lineIndex', () => {
      const store = new CommentStore();
      
      // Add comments with mixed lineIndex types
      store.addComment(0, 'file.ts', 'line 1', 'normal comment');
      store.addComment(undefined, 'file.ts', 'removed line', 'removed comment');
      store.addComment(1, 'file.ts', 'line 2', 'another normal comment');
      store.addComment(undefined, 'other.ts', 'other.ts', 'file header comment');
      
      expect(store.count).toBe(4);
      
      // Test retrieval
      expect(store.hasComment(0, 'file.ts')).toBe(true);
      expect(store.hasComment(undefined, 'file.ts')).toBe(true);
      expect(store.hasComment(undefined, 'other.ts')).toBe(true);
      
      // Test removal
      expect(store.removeComment(undefined, 'file.ts')).toBe(true);
      expect(store.hasComment(undefined, 'file.ts')).toBe(false);
      expect(store.count).toBe(3);
    });

    test('sorts comments correctly with undefined lineIndex', () => {
      const store = new CommentStore();
      
      // Add in random order
      store.addComment(undefined, 'z.ts', 'removed', 'comment 1');
      store.addComment(2, 'a.ts', 'line 3', 'comment 2');
      store.addComment(0, 'a.ts', 'line 1', 'comment 3');
      store.addComment(undefined, 'a.ts', 'a.ts', 'comment 4');
      store.addComment(1, 'a.ts', 'line 2', 'comment 5');
      
      const sorted = store.getAllComments();
      
      // Should sort by filename first, then lineIndex (undefined last within each file)
      expect(sorted[0]).toEqual(expect.objectContaining({fileName: 'a.ts', lineIndex: 0}));
      expect(sorted[1]).toEqual(expect.objectContaining({fileName: 'a.ts', lineIndex: 1}));
      expect(sorted[2]).toEqual(expect.objectContaining({fileName: 'a.ts', lineIndex: 2}));
      expect(sorted[3]).toEqual(expect.objectContaining({fileName: 'a.ts', lineIndex: undefined}));
      expect(sorted[4]).toEqual(expect.objectContaining({fileName: 'z.ts', lineIndex: undefined}));
    });
  });
});