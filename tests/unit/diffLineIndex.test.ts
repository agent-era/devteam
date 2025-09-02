import {describe, test, expect} from '@jest/globals';
import {computeUnifiedPerFileIndices, computeSideBySidePerFileIndices} from '../../src/shared/utils/diffLineIndex.js';

describe('diffLineIndex utilities', () => {
  test('computeUnifiedPerFileIndices maps per file and skips headers', () => {
    const lines = [
      {type: 'header', text: '📁 a.ts', fileName: 'a.ts', headerType: 'file'},
      {type: 'header', text: '  ▼ hunk', fileName: 'a.ts', headerType: 'hunk'},
      {type: 'context', text: 'line1', fileName: 'a.ts'},
      {type: 'added', text: 'line2', fileName: 'a.ts'},
      {type: 'removed', text: 'line3', fileName: 'a.ts'},
      {type: 'header', text: '📁 b.ts', fileName: 'b.ts', headerType: 'file'},
      {type: 'context', text: 'b1', fileName: 'b.ts'},
      {type: 'added', text: 'b2', fileName: 'b.ts'},
    ] as any;

    const map = computeUnifiedPerFileIndices(lines);
    // Headers: undefined or previous counter; content increments per file
    expect(map[0]).toBeUndefined(); // file header
    expect(map[1]).toBeUndefined(); // hunk header
    expect(map[2]).toBe(0);
    expect(map[3]).toBe(1);
    expect(map[4]).toBe(2);
    expect(map[5]).toBeUndefined(); // file header for b.ts
    expect(map[6]).toBe(0);
    expect(map[7]).toBe(1);
  });

  test('computeSideBySidePerFileIndices maps per file and skips headers', () => {
    const rows = [
      {left: {type: 'header', text: '📁 a.ts', fileName: 'a.ts', headerType: 'file'}, right: {type: 'header', text: '📁 a.ts', fileName: 'a.ts', headerType: 'file'}, lineIndex: 0},
      {left: {type: 'context', text: 'a1', fileName: 'a.ts'}, right: {type: 'context', text: 'a1', fileName: 'a.ts'}, lineIndex: 1},
      {left: {type: 'removed', text: 'a2', fileName: 'a.ts'}, right: {type: 'added', text: 'a2', fileName: 'a.ts'}, lineIndex: 2},
      {left: {type: 'header', text: '📁 b.ts', fileName: 'b.ts', headerType: 'file'}, right: {type: 'header', text: '📁 b.ts', fileName: 'b.ts', headerType: 'file'}, lineIndex: 3},
      {left: {type: 'context', text: 'b1', fileName: 'b.ts'}, right: {type: 'context', text: 'b1', fileName: 'b.ts'}, lineIndex: 4},
      {left: {type: 'empty', text: '', fileName: 'b.ts'}, right: {type: 'added', text: 'b2', fileName: 'b.ts'}, lineIndex: 5},
    ] as any;

    const map = computeSideBySidePerFileIndices(rows);
    expect(map[0]).toBeUndefined(); // header
    expect(map[1]).toBe(0);
    expect(map[2]).toBe(1);
    expect(map[3]).toBeUndefined(); // header for b.ts
    expect(map[4]).toBe(0);
    expect(map[5]).toBe(1);
  });
});

