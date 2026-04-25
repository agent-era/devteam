import {describe, test, expect} from '@jest/globals';
import {computeBlockContext} from '../../src/shared/utils/markdown/blockContext.js';
import {lookupBlockContext, isMarkdownFile, type MdContextMap} from '../../src/shared/utils/markdown/diffPrepass.js';
import type {DiffLine} from '../../src/shared/utils/diff/types.js';

describe('isMarkdownFile', () => {
  test('detects .md and .markdown', () => {
    expect(isMarkdownFile('a.md')).toBe(true);
    expect(isMarkdownFile('a.markdown')).toBe(true);
    expect(isMarkdownFile('A.MD')).toBe(true);
    expect(isMarkdownFile('readme.txt')).toBe(false);
    expect(isMarkdownFile(undefined)).toBe(false);
  });
});

describe('lookupBlockContext', () => {
  const post = '# Title\n\nparagraph\n```\ncode\nmore\n```\nafter';
  const pre  = '# Title\n\nold paragraph\nplain\nafter';
  const buildMap = (): MdContextMap => {
    const map: MdContextMap = new Map();
    map.set('docs/a.md', {
      post: computeBlockContext(post),
      pre: computeBlockContext(pre),
    });
    return map;
  };

  test('added line uses post-image context — code lines inside fence render as code', () => {
    const line: DiffLine = {type: 'added', text: 'code', fileName: 'docs/a.md', newLineIndex: 5};
    const ctx = lookupBlockContext(line, 'unified', buildMap());
    expect(ctx?.kind).toBe('code');
  });

  test('added line above the fence in the post-image is paragraph', () => {
    const line: DiffLine = {type: 'added', text: 'paragraph', fileName: 'docs/a.md', newLineIndex: 3};
    const ctx = lookupBlockContext(line, 'unified', buildMap());
    expect(ctx?.kind).toBe('para');
  });

  test('removed line uses pre-image context (paragraph rather than code)', () => {
    const line: DiffLine = {type: 'removed', text: 'old paragraph', fileName: 'docs/a.md', oldLineIndex: 3};
    const ctx = lookupBlockContext(line, 'unified', buildMap());
    expect(ctx?.kind).toBe('para');
  });

  test('non-markdown files return null (preserves existing diff styling)', () => {
    const line: DiffLine = {type: 'added', text: 'foo', fileName: 'src/x.ts', newLineIndex: 1};
    const ctx = lookupBlockContext(line, 'unified', buildMap());
    expect(ctx).toBeNull();
  });

  test('header lines return null (the diff renders its own header)', () => {
    const line: DiffLine = {type: 'header', text: '📁 docs/a.md', fileName: 'docs/a.md', headerType: 'file'};
    const ctx = lookupBlockContext(line, 'unified', buildMap());
    expect(ctx).toBeNull();
  });

  test('falls back to paragraph when the file is not in the map', () => {
    const empty: MdContextMap = new Map();
    const line: DiffLine = {type: 'added', text: 'x', fileName: 'docs/missing.md', newLineIndex: 1};
    const ctx = lookupBlockContext(line, 'unified', empty);
    expect(ctx?.kind).toBe('para');
  });
});
