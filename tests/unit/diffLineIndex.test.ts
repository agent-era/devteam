import {describe, test, expect} from '@jest/globals';
import {computeUnifiedPerFileIndices, computeSideBySidePerFileIndices, UnifiedDiffLine, SideBySideRow} from '../../src/shared/utils/diffLineIndex.js';

describe('diff line index mapping (current version)', () => {
  test('unified view maps only added/context to current line numbers', () => {
    const lines: UnifiedDiffLine[] = [
      {type: 'header', text: '📁 src/a.ts', fileName: 'src/a.ts', headerType: 'file'},
      {type: 'removed', text: 'old', fileName: 'src/a.ts'},
      {type: 'added', text: 'new', fileName: 'src/a.ts'},
      {type: 'context', text: 'same', fileName: 'src/a.ts'},
      {type: 'removed', text: 'old2', fileName: 'src/a.ts'},
    ];
    const map = computeUnifiedPerFileIndices(lines);
    // header maps to 0 (initial)
    expect(map[0]).toBeUndefined(); // no counter yet since we only count added/context
    expect(map[1]).toBeUndefined(); // removed has no current line
    expect(map[2]).toBe(0); // first current line
    expect(map[3]).toBe(1); // second current line
    expect(map[4]).toBeUndefined(); // removed line
  });

  test('side-by-side view maps by right side only', () => {
    const rows: SideBySideRow[] = [
      { left: {type: 'header', text: '📁 src/b.ts', fileName: 'src/b.ts', headerType: 'file'}, right: {type: 'header', text: '📁 src/b.ts', fileName: 'src/b.ts', headerType: 'file'}, lineIndex: 0 },
      { left: {type: 'removed', text: 'old', fileName: 'src/b.ts'}, right: {type: 'added', text: 'new', fileName: 'src/b.ts'}, lineIndex: 1 },
      { left: {type: 'removed', text: 'old2', fileName: 'src/b.ts'}, right: {type: 'empty', text: '', fileName: 'src/b.ts'}, lineIndex: 2 },
      { left: {type: 'context', text: 'same', fileName: 'src/b.ts'}, right: {type: 'context', text: 'same', fileName: 'src/b.ts'}, lineIndex: 3 },
    ];
    const map = computeSideBySidePerFileIndices(rows);
    // header maps to 0 (no current counted yet)
    expect(map[0]).toBeUndefined();
    // paired removed/added -> map to right counter 0
    expect(map[1]).toBe(0);
    // removed-only (no right) -> undefined
    expect(map[2]).toBeUndefined();
    // context with right -> next index 1
    expect(map[3]).toBe(1);
  });
});

