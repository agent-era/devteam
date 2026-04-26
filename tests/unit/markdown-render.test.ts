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
    // Codespan exists as its own span (the merge-with-neighbour skip happens
    // because of the colour/dim differences vs the surrounding plain text).
    expect(find(s => s.text === 'code')).toBeTruthy();
    // Link text inherits the surrounding colour rather than overriding it,
    // so it merges into adjacent text spans — assert it appears anywhere.
    expect(spans.some(s => s.text.includes('text'))).toBe(true);
    expect(spans.some(s => s.text.includes('http://x'))).toBe(true);
  });
});

describe('lineToParts', () => {
  test('heading line carries the level colour on both the marker and the body', () => {
    const ctx = computeBlockContext('## Hello')[1];
    const parts = lineToParts('## Hello', ctx);
    expect(parts.leading.some(s => s.text.includes('##'))).toBe(true);
    const bodySpan = parts.body.find(s => s.text === 'Hello');
    expect(bodySpan?.bold).toBe(true);
    expect(bodySpan?.color).toBeTruthy();
    // Marker colour should match the body colour for visual consistency.
    const markerColored = parts.leading.find(s => s.text.includes('##'));
    expect(markerColored?.color).toBe(bodySpan?.color);
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

  test('code line passes content through verbatim with the theme colour', () => {
    const ctx = computeBlockContext('```\nconst x = 1;\n```')[2];
    const parts = lineToParts('const x = 1;', ctx);
    expect(parts.body[0].text).toBe('const x = 1;');
    // Active theme's codeColor (or bodyColor as fallback) lands on fenced
    // code lines. We just assert a span is produced — colour / dim flags
    // depend on the active theme.
    expect(parts.body.length).toBeGreaterThan(0);
  });
});

describe('wrapSpans', () => {
  test('hard-breaks a single long word when there is no whitespace to wrap on', () => {
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

  test('respects leading and continuation prefixes when hard-breaking', () => {
    const spans: Span[] = [{text: 'wxyzwxyz'}];
    const rows = wrapSpans(spans, 6, [{text: '> '}], [{text: '  '}]);
    expect(rows.map(r => r.spans.map(s => s.text).join(''))).toEqual([
      '> wxyz',
      '  wxyz',
    ]);
  });

  test('wraps on word boundaries when whitespace is present', () => {
    const spans: Span[] = [{text: 'one two three four five six seven eight nine ten'}];
    const rows = wrapSpans(spans, 12);
    const lines = rows.map(r => r.spans.map(s => s.text).join(''));
    // No row exceeds the width.
    for (const line of lines) {
      expect(stringDisplayWidth(line)).toBeLessThanOrEqual(12);
    }
    // No row starts with whitespace (we drop leading whitespace on wrap).
    for (const line of lines) {
      expect(/^\s/.test(line)).toBe(false);
    }
    // No row ends with whitespace (we trim trailing whitespace on wrap).
    for (const line of lines) {
      expect(/\s$/.test(line)).toBe(false);
    }
    // Joined output preserves every word in order.
    expect(lines.join(' ').split(/\s+/)).toEqual(['one','two','three','four','five','six','seven','eight','nine','ten']);
  });

  test('mid-word hard-break still kicks in for words longer than the line', () => {
    const spans: Span[] = [{text: 'short supercalifragilisticexpialidocious end'}];
    const rows = wrapSpans(spans, 10);
    const lines = rows.map(r => r.spans.map(s => s.text).join(''));
    for (const line of lines) {
      expect(stringDisplayWidth(line)).toBeLessThanOrEqual(10);
    }
    // The leading short word wraps cleanly; the long word is hard-broken
    // across multiple rows.
    expect(lines[0]).toBe('short');
    // All chars of the long word + trailing word are still preserved.
    expect(lines.join('').replace(/\s/g, '')).toBe('shortsupercalifragilisticexpialidociousend');
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
    // H1 produces 3 rows: top "===" bar, the heading, bottom "===" bar.
    expect(rows.length).toBe(3);
    // Bar width matches the heading text width (# + space + Title = 7 chars), not the viewport.
    expect(rows[0].spans[0].text).toBe('='.repeat(7));
    expect(rows[2].spans[0].text).toBe('='.repeat(7));
    expect(rows[1].spans.some(s => s.text.includes('#'))).toBe(true);
    expect(rows[1].spans.some(s => s.text.includes('Title') && s.bold)).toBe(true);
  });

  test('H2 gets a "---" rule after the heading, sized to the heading width', () => {
    const rows = renderMarkdown('## Sub', 60);
    // 2 rows: heading then bar. Bar = "## Sub" → 6 chars wide.
    expect(rows.length).toBe(2);
    expect(rows[1].spans[0].text).toBe('-'.repeat(6));
  });

  test('H3+ render without surrounding rules', () => {
    const rows = renderMarkdown('### Deeper', 40);
    expect(rows.length).toBe(1);
    expect(rows[0].spans.every(s => !/^[=-]+$/.test(s.text))).toBe(true);
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
