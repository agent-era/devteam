import {stringDisplayWidth} from '../formatting.js';
import {computeBlockContext} from './blockContext.js';
import {inlineToSpans} from './inline.js';
import {getActiveMarkdownTheme, type MarkdownTheme} from './themes.js';
import type {BlockContext, MdRow, Span} from './types.js';

/**
 * Apply the active theme's "plain text" style to inline spans that don't
 * carry their own colour, bold, or inverse flag. Coloured spans (codespan,
 * link, image fallback) keep their look so they still pop visually.
 */
function applyPlainStyle(spans: Span[], theme: MarkdownTheme): Span[] {
  return spans.map(s => {
    if (s.bold || s.color || s.inverse) return s;
    const next = {...s};
    if (theme.plainDim) next.dim = true;
    if (theme.plainColor) next.color = theme.plainColor;
    return next;
  });
}

export function wrapSpans(spans: Span[], width: number, leading: Span[] = [], continuation: Span[] = []): MdRow[] {
  const safeWidth = Math.max(1, width);
  const leadingWidth = stringDisplayWidth(leading.map(s => s.text).join(''));
  const continuationWidth = stringDisplayWidth(continuation.map(s => s.text).join(''));

  const rows: MdRow[] = [];
  let currentRow: Span[] = [...leading];
  let prefixWidth = leadingWidth;
  let currentWidth = leadingWidth;

  const startNewRow = (): void => {
    rows.push({spans: currentRow.length ? currentRow : [{text: ''}]});
    currentRow = [...continuation];
    prefixWidth = continuationWidth;
    currentWidth = continuationWidth;
  };

  const pushChar = (ch: string, style: Span): void => {
    const cw = stringDisplayWidth(ch);
    if (currentWidth + cw > safeWidth && currentWidth > prefixWidth) {
      startNewRow();
    }
    const last = currentRow[currentRow.length - 1];
    if (last && stylesMatch(last, style)) {
      last.text += ch;
    } else {
      currentRow.push({...style, text: ch});
    }
    currentWidth += cw;
  };

  for (const span of spans) {
    const {text} = span;
    if (!text) continue;
    for (const ch of text) {
      pushChar(ch, span);
    }
  }

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
      return {leading: [], body: [{text: rawLine || ' ', color: theme.codeColor, dim: theme.codeDim || undefined}], continuation: []};

    case 'hr':
      return {leading: [], body: [], continuation: [], isHr: true};

    case 'heading': {
      const body = rawLine.slice(ctx.textStart).trim().replace(/\s*#+\s*$/, '');
      const color = theme.heading[ctx.level] ?? 'white';
      const spans = inlineToSpans(body, {bold: true, color}, theme);
      const leading: Span[] = [{text: '#'.repeat(ctx.level) + ' ', dim: true}];
      const continuation: Span[] = [{text: ' '.repeat(ctx.level + 1)}];
      return {leading, body: spans, continuation};
    }

    case 'blockquote': {
      const body = rawLine.slice(ctx.textStart);
      const spans = inlineToSpans(body, {italic: true, dim: !!theme.blockquoteDim}, theme);
      const bar: Span[] = [{text: '│ ', color: theme.blockquoteBarColor, dim: !!theme.blockquoteDim}];
      return {leading: bar, body: spans, continuation: bar};
    }

    case 'list': {
      const body = rawLine.slice(ctx.textStart);
      const indent = ' '.repeat(ctx.indent);
      const bullet = ctx.ordered ? `${ctx.bullet} ` : '• ';
      const leading: Span[] = [{text: indent}, {text: bullet, color: theme.bulletColor}];
      const spans = applyPlainStyle(inlineToSpans(body, {}, theme), theme);
      const continuation: Span[] = [{text: indent + ' '.repeat(stringDisplayWidth(bullet))}];
      return {leading, body: spans, continuation};
    }

    case 'para':
    default:
      return {leading: [], body: applyPlainStyle(inlineToSpans(rawLine, {}, theme), theme), continuation: []};
  }
}

/**
 * Render a single source line according to its block context. The result
 * is one *or more* visual rows (when wrapping kicks in). The diff view
 * calls `lineToParts` directly so it can keep its own gutter/padding
 * geometry; the full-doc renderer below uses this convenience wrapper.
 */
export function renderLine(rawLine: string, ctx: BlockContext, width: number, theme: MarkdownTheme = getActiveMarkdownTheme()): MdRow[] {
  const safeWidth = Math.max(1, width);
  if (ctx.kind === 'blank') return [{spans: [{text: ''}]}];

  const parts = lineToParts(rawLine, ctx, theme);
  if (parts.isHr) return [{spans: [{text: '─'.repeat(safeWidth), dim: true}]}];

  return wrapSpans(parts.body, safeWidth, parts.leading, parts.continuation);
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
