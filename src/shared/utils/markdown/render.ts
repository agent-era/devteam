import {stringDisplayWidth} from '../formatting.js';
import {computeBlockContext} from './blockContext.js';
import {inlineToSpans} from './inline.js';
import {getActiveMarkdownTheme, type MarkdownTheme} from './themes.js';
import type {BlockContext, MdRow, Span} from './types.js';

type SpanStyle = Omit<Span, 'text'>;

interface WrapToken {
  text: string;
  style: SpanStyle;
  isSpace: boolean;
}

/**
 * Split styled spans into a stream of word / whitespace tokens, preserving
 * each token's source style. Used by `wrapSpans` to wrap on word boundaries.
 */
function tokenizeForWrap(spans: Span[]): WrapToken[] {
  const tokens: WrapToken[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const {text, ...style} = span;
    for (const m of text.matchAll(/(\s+|\S+)/g)) {
      tokens.push({text: m[0], style, isSpace: /^\s/.test(m[0])});
    }
  }
  return tokens;
}

function trimTrailingWhitespace(row: Span[], prefixCount: number): void {
  while (row.length > prefixCount) {
    const last = row[row.length - 1];
    if (!last.text) { row.pop(); continue; }
    const trimmed = last.text.replace(/\s+$/, '');
    if (trimmed === last.text) return;
    if (trimmed === '') { row.pop(); continue; }
    last.text = trimmed;
    return;
  }
}

/**
 * Wrap styled spans into one or more visual rows that fit within `width`.
 * Wraps preferentially at whitespace (word boundaries); a word that's
 * longer than the available content width falls back to character-level
 * hard-break so it still fits. Leading whitespace at the start of a wrapped
 * row is dropped; trailing whitespace at the end of a row is trimmed.
 */
export function wrapSpans(spans: Span[], width: number, leading: Span[] = [], continuation: Span[] = []): MdRow[] {
  const safeWidth = Math.max(1, width);
  const leadingWidth = stringDisplayWidth(leading.map(s => s.text).join(''));
  const continuationWidth = stringDisplayWidth(continuation.map(s => s.text).join(''));

  const rows: MdRow[] = [];
  let currentRow: Span[] = [...leading];
  let prefixCount = leading.length;
  let prefixWidth = leadingWidth;
  let currentWidth = leadingWidth;

  const isAtPrefix = (): boolean => currentWidth === prefixWidth;

  const flushRow = (): void => {
    rows.push({spans: currentRow.length ? currentRow : [{text: ''}]});
    currentRow = [...continuation];
    prefixCount = continuation.length;
    prefixWidth = continuationWidth;
    currentWidth = continuationWidth;
  };

  const append = (text: string, style: SpanStyle): void => {
    if (!text) return;
    const merged: Span = {...style, text};
    const last = currentRow[currentRow.length - 1];
    if (last && stylesMatch(last, merged)) {
      last.text += text;
    } else {
      currentRow.push(merged);
    }
    currentWidth += stringDisplayWidth(text);
  };

  const hardBreakWord = (text: string, style: SpanStyle): void => {
    for (const ch of text) {
      const cw = stringDisplayWidth(ch);
      if (currentWidth + cw > safeWidth && !isAtPrefix()) {
        flushRow();
      }
      append(ch, style);
    }
  };

  for (const tok of tokenizeForWrap(spans)) {
    const tw = stringDisplayWidth(tok.text);

    if (tok.isSpace) {
      if (isAtPrefix()) continue; // drop leading whitespace at the start of a row
      if (currentWidth + tw > safeWidth) {
        // Whitespace would push us over — treat it as the wrap point.
        trimTrailingWhitespace(currentRow, prefixCount);
        flushRow();
        continue;
      }
      append(tok.text, tok.style);
      continue;
    }

    if (currentWidth + tw <= safeWidth) {
      append(tok.text, tok.style);
      continue;
    }

    if (!isAtPrefix()) {
      trimTrailingWhitespace(currentRow, prefixCount);
      flushRow();
    }

    if (tw <= safeWidth - currentWidth) {
      append(tok.text, tok.style);
    } else {
      // Word longer than a full line — hard-break so it still fits.
      hardBreakWord(tok.text, tok.style);
    }
  }

  trimTrailingWhitespace(currentRow, prefixCount);
  rows.push({spans: currentRow.length ? currentRow : [{text: ''}]});
  return rows;
}

function stylesMatch(a: Span, b: Span): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.dim === !!b.dim &&
    a.color === b.color &&
    !!a.inverse === !!b.inverse
  );
}

export interface LineParts {
  leading: Span[];
  body: Span[];
  continuation: Span[];
  /** Special-case: the row should be rendered as an HR (full-width rule). */
  isHr?: boolean;
}

/**
 * Decompose a raw markdown line + its block context into a leading prefix
 * (e.g. heading marker, list bullet, blockquote bar), a stream of styled
 * body spans (already inline-parsed), and a continuation prefix used for
 * wrapped rows. Width-aware wrapping is applied separately by callers,
 * which lets the diff view reuse the same span output without repeating
 * its own row geometry logic.
 */
export function lineToParts(rawLine: string, ctx: BlockContext, theme: MarkdownTheme = getActiveMarkdownTheme()): LineParts {
  switch (ctx.kind) {
    case 'blank':
      return {leading: [], body: [], continuation: []};

    case 'code':
      // Fenced code lines: theme's codeColor (or bodyColor as fallback) with
      // optional dim. Same colour rule as inline code in inline.ts.
      return {leading: [], body: [{text: rawLine || ' ', color: theme.codeColor ?? theme.bodyColor, dim: theme.codeDim || undefined}], continuation: []};

    case 'hr':
      return {leading: [], body: [], continuation: [], isHr: true};

    case 'heading': {
      const body = rawLine.slice(ctx.textStart).trim().replace(/\s*#+\s*$/, '');
      const color = theme.heading[ctx.level] ?? 'white';
      const spans = inlineToSpans(body, {bold: true, color}, theme);
      const leading: Span[] = [{text: '#'.repeat(ctx.level) + ' ', bold: true, color}];
      const continuation: Span[] = [{text: ' '.repeat(ctx.level + 1)}];
      return {leading, body: spans, continuation};
    }

    case 'blockquote': {
      const body = rawLine.slice(ctx.textStart);
      const spans = inlineToSpans(body, {italic: true, dim: !!theme.blockquoteDim, color: theme.bodyColor}, theme);
      const bar: Span[] = [{text: '│ ', color: theme.blockquoteBarColor, dim: !!theme.blockquoteDim}];
      return {leading: bar, body: spans, continuation: bar};
    }

    case 'list': {
      const body = rawLine.slice(ctx.textStart);
      const indent = ' '.repeat(ctx.indent);
      const bullet = ctx.ordered ? `${ctx.bullet} ` : '• ';
      // Bullet keeps its theme colour. Body text uses the theme's bodyColor
      // so all body spans share one hue (regular, bold, italic, code).
      const leading: Span[] = [{text: indent}, {text: bullet, color: theme.bulletColor}];
      const spans = inlineToSpans(body, {color: theme.bodyColor}, theme);
      const continuation: Span[] = [{text: indent + ' '.repeat(stringDisplayWidth(bullet))}];
      return {leading, body: spans, continuation};
    }

    case 'para':
    default:
      // Paragraph body uses the theme's bodyColor for all inline spans; bold,
      // italic, codespan, and link tokens all inherit it so the body is
      // monochromatic per theme.
      return {leading: [], body: inlineToSpans(rawLine, {color: theme.bodyColor}, theme), continuation: []};
  }
}

/**
 * Render a single source line according to its block context. The result
 * is one *or more* visual rows (when wrapping kicks in). The diff view
 * calls `lineToParts` directly so it can keep its own gutter/padding
 * geometry; the full-doc renderer below uses this convenience wrapper.
 *
 * H1 lines additionally get a full-width `===` rule before and after, and
 * H2 lines get a `---` rule after — typographic decoration to match
 * common written-markdown setext hierarchies. H3+ render plain.
 */
export function renderLine(rawLine: string, ctx: BlockContext, width: number, theme: MarkdownTheme = getActiveMarkdownTheme()): MdRow[] {
  const safeWidth = Math.max(1, width);
  if (ctx.kind === 'blank') return [{spans: [{text: ''}]}];

  const parts = lineToParts(rawLine, ctx, theme);
  if (parts.isHr) return [{spans: [{text: '─'.repeat(safeWidth), dim: true}]}];

  const rows = wrapSpans(parts.body, safeWidth, parts.leading, parts.continuation);

  if (ctx.kind === 'heading' && (ctx.level === 1 || ctx.level === 2)) {
    // Bar width matches the longest rendered heading row (including marker
    // and any wrapped continuation), so the rule is only as wide as the
    // actual heading text rather than the full viewport.
    let barWidth = 0;
    for (const row of rows) {
      const w = stringDisplayWidth(row.spans.map(s => s.text).join(''));
      if (w > barWidth) barWidth = w;
    }
    barWidth = Math.max(1, Math.min(safeWidth, barWidth));
    const color = theme.heading[ctx.level] ?? 'white';
    const ch = ctx.level === 1 ? '=' : '-';
    const bar: MdRow = {spans: [{text: ch.repeat(barWidth), bold: true, color}]};
    return ctx.level === 1 ? [bar, ...rows, bar] : [...rows, bar];
  }

  return rows;
}

/**
 * Render an entire markdown document into visual rows that fit within
 * `width`. The output is meant to be sliced by a viewport.
 */
export function renderMarkdown(content: string, width: number, theme: MarkdownTheme = getActiveMarkdownTheme()): MdRow[] {
  if (!content || !content.trim()) {
    return [{spans: [{text: '(empty)', dim: true}]}];
  }
  const lines = content.split('\n');
  const ctx = computeBlockContext(content);
  const rows: MdRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineCtx = ctx[i + 1];
    rows.push(...renderLine(line, lineCtx, width, theme));
  }
  if (rows.length && rows[rows.length - 1].spans.every(s => !s.text)) rows.pop();
  return rows;
}
