import {describe, test, expect} from '@jest/globals';
import {renderMarkdown, lineToParts, wrapSpans} from '../../src/shared/utils/markdown/render.js';
import {computeBlockContext} from '../../src/shared/utils/markdown/blockContext.js';
import {inlineToSpans} from '../../src/shared/utils/markdown/inline.js';
import {stringDisplayWidth} from '../../src/shared/utils/formatting.js';
import type {Span, MdRow} from '../../src/shared/utils/markdown/types.js';

const flatten = (rows: MdRow[]): string => rows.map(r => r.spans.map(s => s.text).join('')).join('\n');

describe('inlineToSpans', () => {
  test('parses bold, italic, code, and link with appropriate styles', () => {
    const spans = inlineToSpans('**bold** *it* `code` [text](http://x)');
    const find = (predicate: (s: Span) => boolean) => spans.find(predicate);
    expect(find(s => s.text === 'bold')?.bold).toBe(true);
    expect(find(s => s.text === 'it')?.italic).toBe(true);
    expect(find(s => s.text === 'code')?.color).toBe('yellow');
    expect(find(s => s.text === 'code')?.dim).toBe(true);
    expect(find(s => s.text === 'text')?.color).toBe('cyan');
    expect(spans.some(s => s.text.includes('http://x'))).toBe(true);
  });
});

describe('lineToParts', () => {
  test('heading line produces a coloured leading marker and a bold (uncoloured) body', () => {
    const ctx = computeBlockContext('## Hello')[1];
    const parts = lineToParts('## Hello', ctx);
    // Leading carries the level marker; body is bold but uncoloured so it
    // renders at the same brightness as any other bold span.
    expect(parts.leading.some(s => s.text.includes('##'))).toBe(true);
    const bodySpan = parts.body.find(s => s.text === 'Hello');
    expect(bodySpan?.bold).toBe(true);
    expect(bodySpan?.color).toBeUndefined();
  });

  test('list item line produces bullet and body spans', () => {
    const ctx = computeBlockContext('- item *with* style')[1];
    const parts = lineToParts('- item *with* style', ctx);
    expect(parts.leading.some(s => s.text.includes('•'))).toBe(true);
    expect(parts.body.find(s => s.text === 'with')?.italic).toBe(true);
  });

  test('blockquote line uses italic dim text', () => {
    const ctx = computeBlockContext('> quote me')[1];
    const parts = lineToParts('> quote me', ctx);
    expect(parts.leading[0].text).toBe('│ ');
    expect(parts.body.every(s => s.italic && s.dim)).toBe(true);
  });

  test('code line passes content through verbatim', () => {
    const ctx = computeBlockContext('```\nconst x = 1;\n```')[2];
    const parts = lineToParts('const x = 1;', ctx);
    expect(parts.body[0].text).toBe('const x = 1;');
    expect(parts.body[0].color).toBe('yellow');
    expect(parts.body[0].dim).toBe(true);
  });
});

describe('wrapSpans', () => {
  test('wraps long content while keeping styles per span', () => {
    const spans: Span[] = [
      {text: 'aaaa', bold: true},
      {text: 'bbbb', color: 'cyan'},
      {text: 'cccc'},
    ];
    const rows = wrapSpans(spans, 4);
    expect(rows.length).toBe(3);
    expect(rows[0].spans[0]).toMatchObject({text: 'aaaa', bold: true});
    expect(rows[1].spans[0]).toMatchObject({text: 'bbbb', color: 'cyan'});
    expect(rows[2].spans[0]).toMatchObject({text: 'cccc'});
  });

  test('respects leading and continuation prefixes', () => {
    const spans: Span[] = [{text: 'wxyzwxyz'}];
    const rows = wrapSpans(spans, 6, [{text: '> '}], [{text: '  '}]);
    expect(rows.map(r => r.spans.map(s => s.text).join(''))).toEqual([
      '> wxyz',
      '  wxyz',
    ]);
  });

  test('no row exceeds the target width measured by stringDisplayWidth', () => {
    const spans: Span[] = [{text: 'one two three four five six seven eight nine ten'}];
    const rows = wrapSpans(spans, 12);
    for (const row of rows) {
      const w = stringDisplayWidth(row.spans.map(s => s.text).join(''));
      expect(w).toBeLessThanOrEqual(12);
    }
  });
});

describe('renderMarkdown', () => {
  test('empty input renders a single dim "(empty)" row', () => {
    const rows = renderMarkdown('   ', 80);
    expect(rows).toHaveLength(1);
    expect(rows[0].spans[0].text).toBe('(empty)');
    expect(rows[0].spans[0].dim).toBe(true);
  });

  test('renders headings with bold + leading marker', () => {
    const rows = renderMarkdown('# Title', 80);
    expect(rows[0].spans.some(s => s.text.includes('#'))).toBe(true);
    expect(rows[0].spans.some(s => s.text === 'Title' && s.bold)).toBe(true);
  });

  test('renders fenced code lines verbatim, not as headings', () => {
    const md = '```\n# not a heading\n```';
    const rendered = flatten(renderMarkdown(md, 80));
    expect(rendered).toContain('# not a heading');
  });

  test('renders horizontal rules across the full width', () => {
    const rows = renderMarkdown('---', 10);
    expect(rows[0].spans[0].text).toBe('─'.repeat(10));
  });
});
