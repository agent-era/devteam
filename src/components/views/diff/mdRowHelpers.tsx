import React from 'react';
import {Text} from 'ink';
import {stringDisplayWidth} from '../../../shared/utils/formatting.js';
import {lineToParts, spansDisplayWidth, wrapSpans} from '../../../shared/utils/markdown/render.js';
import type {Span} from '../../../shared/utils/markdown/types.js';
import type {BlockContext} from '../../../shared/utils/markdown/types.js';

/**
 * Build wrapped span rows for a single `.md` diff line. Reused by the
 * unified and side-by-side diff rendering paths.
 */
export function buildMdRows(
  text: string,
  ctx: BlockContext | null,
  width: number,
  isWrap: boolean,
  prefixSpans: Span[],
): Span[][] {
  if (!ctx) return [];
  if (ctx.kind === 'hr') {
    const remaining = Math.max(0, width - spansDisplayWidth(prefixSpans));
    return [[...prefixSpans, {text: '─'.repeat(remaining), dim: true}]];
  }
  const parts = lineToParts(text, ctx);
  const leading = [...prefixSpans, ...parts.leading];
  const continuation = [
    ...prefixSpans.map(s => ({...s, text: ' '.repeat(stringDisplayWidth(s.text))})),
    ...parts.continuation,
  ];
  const rows = wrapSpans(parts.body, width, leading, continuation);
  return (isWrap ? rows : rows.slice(0, 1)).map(r => r.spans);
}

interface MdLineProps {
  spans: Span[];
  width: number;
  background: string | undefined;
  bold: boolean;
}

/**
 * Render a single visual diff row of styled markdown spans, padded with
 * trailing whitespace so the row's `background` extends to `width`.
 */
export function MdLine({spans, width, background, bold}: MdLineProps) {
  const padCount = Math.max(0, width - spansDisplayWidth(spans));
  return (
    <>
      {spans.map((s, i) => (
        <Text
          key={i}
          bold={bold || s.bold || undefined}
          italic={s.italic || undefined}
          dimColor={s.dim || undefined}
          color={s.color}
          backgroundColor={background}
          inverse={s.inverse || undefined}
          wrap="truncate"
        >
          {s.text}
        </Text>
      ))}
      {padCount > 0 && (
        <Text backgroundColor={background} wrap="truncate">{' '.repeat(padCount)}</Text>
      )}
    </>
  );
}
