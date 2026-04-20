import {describe, test, expect} from '@jest/globals';
import {convertToSideBySide} from '../../src/shared/utils/diff/convertToSideBySide.js';
import type {DiffLine} from '../../src/shared/utils/diff/types.js';

describe('Side-by-side diff conversion', () => {
  test('should convert simple addition correctly', () => {
    const unified: DiffLine[] = [
      {type: 'header', text: '📁 test.js', fileName: 'test.js'},
      {type: 'context', text: 'function test() {', fileName: 'test.js'},
      {type: 'added', text: '  console.log("new line");', fileName: 'test.js'},
      {type: 'context', text: '}', fileName: 'test.js'}
    ];

    const result = convertToSideBySide(unified);

    expect(result).toHaveLength(4);

    expect(result[0].left?.type).toBe('header');
    expect(result[0].right?.type).toBe('header');
    expect(result[0].left?.text).toBe('📁 test.js');

    expect(result[1].left?.type).toBe('context');
    expect(result[1].right?.type).toBe('context');

    expect(result[2].left?.type).toBe('empty');
    expect(result[2].right?.type).toBe('added');
    expect(result[2].right?.text).toBe('  console.log("new line");');
  });

  test('should convert simple removal correctly', () => {
    const unified: DiffLine[] = [
      {type: 'header', text: '📁 test.js', fileName: 'test.js'},
      {type: 'context', text: 'function test() {', fileName: 'test.js'},
      {type: 'removed', text: '  console.log("old line");', fileName: 'test.js'},
      {type: 'context', text: '}', fileName: 'test.js'}
    ];

    const result = convertToSideBySide(unified);

    expect(result).toHaveLength(4);

    expect(result[2].left?.type).toBe('removed');
    expect(result[2].right?.type).toBe('empty');
    expect(result[2].left?.text).toBe('  console.log("old line");');
  });

  test('should pair removed and added lines correctly', () => {
    const unified: DiffLine[] = [
      {type: 'header', text: '📁 test.js', fileName: 'test.js'},
      {type: 'removed', text: '  const old = "old";', fileName: 'test.js'},
      {type: 'removed', text: '  console.log(old);', fileName: 'test.js'},
      {type: 'added', text: '  const newVar = "new";', fileName: 'test.js'},
      {type: 'added', text: '  console.log(newVar);', fileName: 'test.js'},
      {type: 'context', text: '}', fileName: 'test.js'}
    ];

    const result = convertToSideBySide(unified);

    expect(result).toHaveLength(4);

    expect(result[1].left?.type).toBe('removed');
    expect(result[1].right?.type).toBe('added');
    expect(result[1].left?.text).toBe('  const old = "old";');
    expect(result[1].right?.text).toBe('  const newVar = "new";');

    expect(result[2].left?.type).toBe('removed');
    expect(result[2].right?.type).toBe('added');
    expect(result[2].left?.text).toBe('  console.log(old);');
    expect(result[2].right?.text).toBe('  console.log(newVar);');
  });

  test('should handle uneven removed/added counts', () => {
    const unified: DiffLine[] = [
      {type: 'removed', text: 'line1', fileName: 'test.js'},
      {type: 'removed', text: 'line2', fileName: 'test.js'},
      {type: 'removed', text: 'line3', fileName: 'test.js'},
      {type: 'added', text: 'new line', fileName: 'test.js'}
    ];

    const result = convertToSideBySide(unified);

    expect(result).toHaveLength(3);

    expect(result[0].left?.type).toBe('removed');
    expect(result[0].right?.type).toBe('added');

    expect(result[1].left?.type).toBe('removed');
    expect(result[1].right?.type).toBe('empty');

    expect(result[2].left?.type).toBe('removed');
    expect(result[2].right?.type).toBe('empty');
  });
});
