import {Lexer} from 'marked';
import type {Span} from './types.js';
import {getActiveMarkdownTheme, type MarkdownTheme} from './themes.js';

const inlineLexer = new Lexer();

interface SpanStyle {
  bold?: boolean;
  italic?: boolean;
  dim?: boolean;
  color?: string;
}

function combine(a: SpanStyle, b: SpanStyle): SpanStyle {
  return {
    bold: a.bold || b.bold,
    italic: a.italic || b.italic,
    dim: a.dim || b.dim,
    color: b.color ?? a.color,
  };
}

function pushText(spans: Span[], text: string, style: SpanStyle): void {
  if (!text) return;
  const prev = spans[spans.length - 1];
  if (
    prev &&
    !!prev.bold === !!style.bold &&
    !!prev.italic === !!style.italic &&
    !!prev.dim === !!style.dim &&
    prev.color === style.color
  ) {
    prev.text += text;
    return;
  }
  spans.push({
    text,
    bold: style.bold || undefined,
    italic: style.italic || undefined,
    dim: style.dim || undefined,
    color: style.color,
  });
}

function walk(token: any, style: SpanStyle, spans: Span[], theme: MarkdownTheme): void {
  if (!token) return;
  if (Array.isArray(token)) {
    for (const t of token) walk(t, style, spans, theme);
    return;
  }
  switch (token.type) {
    case 'text': {
      if (token.tokens && token.tokens.length > 0) {
        walk(token.tokens, style, spans, theme);
      } else {
        pushText(spans, token.text ?? token.raw ?? '', style);
      }
      return;
    }
    case 'escape':
      pushText(spans, token.text ?? token.raw ?? '', style);
      return;
    case 'strong': {
      // In body contexts (where the surrounding colour matches bodyColor or
      // is unset) we boost bold spans to the brighter `boldColor` so `**bold**`
      // pops a little. Inside headings the surrounding colour is the heading
      // hue — we leave that alone so bold-inside-heading keeps the level
      // colour rather than shifting toward white.
      const inBodyContext = style.color === undefined || style.color === theme.bodyColor;
      const next = inBodyContext && theme.boldColor
        ? combine(style, {bold: true, color: theme.boldColor})
        : combine(style, {bold: true});
      walk(token.tokens ?? [], next, spans, theme);
      return;
    }
    case 'em':
      walk(token.tokens ?? [], combine(style, {italic: true}), spans, theme);
      return;
    case 'codespan': {
      // In body contexts: use theme.codeColor if set (gives code a distinct
      // tint like a wheat/yellow accent without relying on `dim`), else
      // inherit the body colour. Inside headings, keep the heading colour
      // so codespans-in-headings don't suddenly switch to the code accent.
      const inBodyContext = style.color === undefined || style.color === theme.bodyColor;
      const overrideColor = inBodyContext ? theme.codeColor : undefined;
      const next = overrideColor
        ? combine(style, {color: overrideColor, dim: !!theme.codeDim})
        : combine(style, {dim: !!theme.codeDim});
      pushText(spans, token.text ?? '', next);
      return;
    }
    case 'del':
      walk(token.tokens ?? [], combine(style, {dim: true}), spans, theme);
      return;
    case 'link': {
      // Link text inherits the surrounding colour. The trailing " (URL)" is
      // dimmed so the bare URL doesn't compete with the link text.
      walk(token.tokens ?? [{type: 'text', text: token.text}], style, spans, theme);
      const href = token.href ? ` (${token.href})` : '';
      if (href) pushText(spans, href, combine(style, {dim: true}));
      return;
    }
    case 'image':
      pushText(spans, `[image: ${token.text || token.href || ''}]`, combine(style, {dim: true}));
      return;
    case 'br':
      pushText(spans, ' ', style);
      return;
    case 'html':
      pushText(spans, token.text ?? token.raw ?? '', combine(style, {dim: true}));
      return;
    default:
      if (token.tokens) walk(token.tokens, style, spans, theme);
      else if (typeof token.text === 'string') pushText(spans, token.text, style);
      else if (typeof token.raw === 'string') pushText(spans, token.raw, style);
  }
}

/**
 * Tokenise a single line of markdown content (no block-level constructs)
 * and emit styled spans, themed by the active markdown theme. The line is
 * expected to already have any block-level prefix (e.g. "# ", "- ", "> ")
 * stripped — see callers in `render.ts`.
 */
export function inlineToSpans(text: string, baseStyle: SpanStyle = {}, theme: MarkdownTheme = getActiveMarkdownTheme()): Span[] {
  if (!text) return [];
  const tokens = inlineLexer.inlineTokens(text, []);
  const spans: Span[] = [];
  walk(tokens, baseStyle, spans, theme);
  return spans;
}
