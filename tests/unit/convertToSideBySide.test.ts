import {describe, test, expect} from '@jest/globals';
import {convertToSideBySide} from '../../src/shared/utils/diff/convertToSideBySide.js';
import type {DiffLine} from '../../src/shared/utils/diff/types.js';

describe('convertToSideBySide — edge cases', () => {
  test('propagates headerType on file and hunk headers to both sides', () => {
    const unified: DiffLine[] = [
      {type: 'header', text: '📁 a.ts', fileName: 'a.ts', headerType: 'file'},
      {type: 'header', text: ' ▼ fn()', fileName: 'a.ts', headerType: 'hunk'},
    ];
    const result = convertToSideBySide(unified);
    expect(result).toHaveLength(2);
    expect(result[0].left?.headerType).toBe('file');
    expect(result[0].right?.headerType).toBe('file');
    expect(result[1].left?.headerType).toBe('hunk');
    expect(result[1].right?.headerType).toBe('hunk');
  });

  test('copies line indices to both sides for context lines', () => {
    const unified: DiffLine[] = [
      {type: 'context', text: 'ctx', fileName: 'a.ts', oldLineIndex: 7, newLineIndex: 11},
    ];
    const row = convertToSideBySide(unified)[0];
    expect(row.left?.oldLineIndex).toBe(7);
    expect(row.left?.newLineIndex).toBe(11);
    expect(row.right?.oldLineIndex).toBe(7);
    expect(row.right?.newLineIndex).toBe(11);
  });

  test('handles mixed removed/added runs separated by context', () => {
    const unified: DiffLine[] = [
      {type: 'removed', text: 'r1', fileName: 'x'},
      {type: 'added', text: 'a1', fileName: 'x'},
      {type: 'context', text: 'c1', fileName: 'x'},
      {type: 'added', text: 'a2', fileName: 'x'},
    ];
    const result = convertToSideBySide(unified);
    expect(result).toHaveLength(3);
    expect(result[0].left?.type).toBe('removed');
    expect(result[0].right?.type).toBe('added');
    expect(result[1].left?.type).toBe('context');
    expect(result[1].right?.type).toBe('context');
    // orphan added line following context lands on right with empty left
    expect(result[2].left?.type).toBe('empty');
    expect(result[2].right?.type).toBe('added');
    expect(result[2].right?.text).toBe('a2');
  });

  test('orphan added line at the very start has empty left', () => {
    const unified: DiffLine[] = [{type: 'added', text: 'added', fileName: 'f'}];
    const result = convertToSideBySide(unified);
    expect(result).toHaveLength(1);
    expect(result[0].left?.type).toBe('empty');
    expect(result[0].right?.type).toBe('added');
  });

  test('fills in empty slots for uneven added runs', () => {
    const unified: DiffLine[] = [
      {type: 'removed', text: 'r1', fileName: 'f'},
      {type: 'added', text: 'a1', fileName: 'f'},
      {type: 'added', text: 'a2', fileName: 'f'},
      {type: 'added', text: 'a3', fileName: 'f'},
    ];
    const result = convertToSideBySide(unified);
    expect(result).toHaveLength(3);
    expect(result[0].left?.type).toBe('removed');
    expect(result[0].right?.type).toBe('added');
    expect(result[1].left?.type).toBe('empty');
    expect(result[1].right?.type).toBe('added');
    expect(result[2].left?.type).toBe('empty');
    expect(result[2].right?.type).toBe('added');
  });

  test('assigns increasing lineIndex values across the result', () => {
    const unified: DiffLine[] = [
      {type: 'header', text: 'h', fileName: 'f', headerType: 'file'},
      {type: 'context', text: 'c', fileName: 'f'},
      {type: 'added', text: 'a', fileName: 'f'},
    ];
    const result = convertToSideBySide(unified);
    expect(result.map(r => r.lineIndex)).toEqual([0, 1, 2]);
  });
});
