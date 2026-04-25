import {Lexer} from 'marked';
import type {Span} from './types.js';

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

function walk(token: any, style: SpanStyle, spans: Span[]): void {
  if (!token) return;
  if (Array.isArray(token)) {
    for (const t of token) walk(t, style, spans);
    return;
  }
  switch (token.type) {
    case 'text': {
      // marked may produce a text token with nested inline tokens (e.g. inside a list_item).
      if (token.tokens && token.tokens.length > 0) {
        walk(token.tokens, style, spans);
      } else {
        pushText(spans, token.text ?? token.raw ?? '', style);
      }
      return;
    }
    case 'escape': {
      pushText(spans, token.text ?? token.raw ?? '', style);
      return;
    }
    case 'strong':
      walk(token.tokens ?? [], combine(style, {bold: true}), spans);
      return;
    case 'em':
      walk(token.tokens ?? [], combine(style, {italic: true}), spans);
      return;
    case 'codespan':
      pushText(spans, token.text ?? '', combine(style, {color: 'yellow', dim: true}));
      return;
    case 'del':
      walk(token.tokens ?? [], combine(style, {dim: true}), spans);
      return;
    case 'link': {
      walk(token.tokens ?? [{type: 'text', text: token.text}], combine(style, {color: 'cyan'}), spans);
      const href = token.href ? ` (${token.href})` : '';
      if (href) pushText(spans, href, combine(style, {dim: true, color: undefined}));
      return;
    }
    case 'image': {
      pushText(spans, `[image: ${token.text || token.href || ''}]`, combine(style, {dim: true}));
      return;
    }
    case 'br':
      pushText(spans, ' ', style);
      return;
    case 'html':
      pushText(spans, token.text ?? token.raw ?? '', combine(style, {dim: true}));
      return;
    default:
      if (token.tokens) walk(token.tokens, style, spans);
      else if (typeof token.text === 'string') pushText(spans, token.text, style);
      else if (typeof token.raw === 'string') pushText(spans, token.raw, style);
  }
}

/**
 * Tokenise a single line of markdown content (no block-level constructs)
 * and emit styled spans. The line is expected to already have any
 * block-level prefix (e.g. "# ", "- ", "> ") stripped — see callers in
 * `render.ts`.
 */
export function inlineToSpans(text: string, baseStyle: SpanStyle = {}): Span[] {
  if (!text) return [];
  const tokens = inlineLexer.inlineTokens(text, []);
  const spans: Span[] = [];
  walk(tokens, baseStyle, spans);
  return spans;
}
