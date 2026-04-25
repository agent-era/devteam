import {describe, test, expect} from '@jest/globals';
import {computeBlockContext} from '../../src/shared/utils/markdown/blockContext.js';

describe('computeBlockContext', () => {
  test('flags lines inside a fenced code block as code', () => {
    const md = [
      'paragraph',
      '```js',
      'const x = 1;',
      'const y = 2;',
      '```',
      'after',
    ].join('\n');
    const ctx = computeBlockContext(md);
    expect(ctx[1].kind).toBe('para');
    expect(ctx[2]).toEqual({kind: 'code', lang: 'js', isFenceMarker: true});
    expect(ctx[3]).toEqual({kind: 'code', lang: 'js', isFenceMarker: false});
    expect(ctx[4]).toEqual({kind: 'code', lang: 'js', isFenceMarker: false});
    expect(ctx[5]).toEqual({kind: 'code', lang: 'js', isFenceMarker: true});
    expect(ctx[6].kind).toBe('para');
  });

  test('detects headings with level + textStart', () => {
    const ctx = computeBlockContext('# H1\n## H2\n###    H3');
    expect(ctx[1]).toMatchObject({kind: 'heading', level: 1});
    expect(ctx[2]).toMatchObject({kind: 'heading', level: 2});
    expect(ctx[3]).toMatchObject({kind: 'heading', level: 3});
  });

  test('detects unordered and ordered list items with indent', () => {
    const ctx = computeBlockContext('- one\n  - nested\n1. first\n2. second');
    expect(ctx[1]).toMatchObject({kind: 'list', indent: 0, bullet: '-', ordered: false});
    expect(ctx[2]).toMatchObject({kind: 'list', indent: 2, bullet: '-', ordered: false});
    expect(ctx[3]).toMatchObject({kind: 'list', indent: 0, bullet: '1.', ordered: true});
    expect(ctx[4]).toMatchObject({kind: 'list', indent: 0, bullet: '2.', ordered: true});
  });

  test('detects blockquote, hr, and blank lines', () => {
    const ctx = computeBlockContext('> quoted\n\n---\nhello');
    expect(ctx[1]).toMatchObject({kind: 'blockquote'});
    expect(ctx[2]).toEqual({kind: 'blank'});
    expect(ctx[3]).toEqual({kind: 'hr'});
    expect(ctx[4]).toEqual({kind: 'para'});
  });

  test('does not classify text inside a fence as a list/heading even if it looks like one', () => {
    const md = '```\n# not a heading\n- not a list\n```';
    const ctx = computeBlockContext(md);
    expect(ctx[1].kind).toBe('code');
    expect(ctx[2].kind).toBe('code');
    expect(ctx[3].kind).toBe('code');
    expect(ctx[4].kind).toBe('code');
  });

  test('handles tilde fences and unmatched fences (open until EOF)', () => {
    const md = '~~~\nA\nB';
    const ctx = computeBlockContext(md);
    expect(ctx[1].kind).toBe('code');
    expect(ctx[2].kind).toBe('code');
    expect(ctx[3].kind).toBe('code');
  });
});
