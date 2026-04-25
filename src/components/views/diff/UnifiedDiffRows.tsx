import React from 'react';
import {Box, Text} from 'ink';
import SyntaxHighlight from 'ink-syntax-highlight';
import {padEndDisplay, fitDisplay, stringDisplayWidth} from '../../../shared/utils/formatting.js';
import {LineWrapper} from '../../../shared/utils/lineWrapper.js';
import type {CommentStore} from '../../../models.js';
import type {DiffLine, WrapMode} from '../../../shared/utils/diff/types.js';
import {lineToParts, wrapSpans} from '../../../shared/utils/markdown/render.js';
import {isMarkdownFile, lookupBlockContext, type MdContextMap} from '../../../shared/utils/markdown/diffPrepass.js';
import type {Span} from '../../../shared/utils/markdown/types.js';

type Props = {
  lines: DiffLine[];
  visibleLineIndices: number[];
  selectedLine: number;
  terminalWidth: number;
  wrapMode: WrapMode;
  perFileIndex: (number | undefined)[];
  commentStore: CommentStore;
  getLanguage: (fileName: string | undefined) => string;
  mdContextMap: MdContextMap;
};

function buildMdRows(
  text: string,
  ctx: ReturnType<typeof lookupBlockContext>,
  bodyWidth: number,
  isWrap: boolean,
  prefixSpans: Span[],
): Span[][] {
  if (!ctx) return [];
  if (ctx.kind === 'hr') {
    const remaining = Math.max(0, bodyWidth - stringDisplayWidth(prefixSpans.map(s => s.text).join('')));
    return [[...prefixSpans, {text: '─'.repeat(remaining), dim: true}]];
  }
  const parts = lineToParts(text, ctx);
  const leading = [...prefixSpans, ...parts.leading];
  const continuation = [...prefixSpans.map(s => ({...s, text: ' '.repeat(stringDisplayWidth(s.text))})), ...parts.continuation];
  const rows = wrapSpans(parts.body, bodyWidth, leading, continuation);
  return (isWrap ? rows : rows.slice(0, 1)).map(r => r.spans);
}

function MdLineBody({spans, width, lineBg, isCurrentLine}: {spans: Span[]; width: number; lineBg: string | undefined; isCurrentLine: boolean}) {
  let used = 0;
  for (const s of spans) used += stringDisplayWidth(s.text);
  const padCount = Math.max(0, width - used);
  return (
    <>
      {spans.map((s, i) => (
        <Text
          key={i}
          bold={isCurrentLine || s.bold || undefined}
          italic={s.italic || undefined}
          dimColor={s.dim || undefined}
          color={s.color}
          backgroundColor={lineBg}
          inverse={s.inverse || undefined}
          wrap="truncate"
        >
          {s.text}
        </Text>
      ))}
      {padCount > 0 && (
        <Text backgroundColor={lineBg} wrap="truncate">{' '.repeat(padCount)}</Text>
      )}
    </>
  );
}

export default function UnifiedDiffRows({
  lines,
  visibleLineIndices,
  selectedLine,
  terminalWidth,
  wrapMode,
  perFileIndex,
  commentStore,
  getLanguage,
  mdContextMap,
}: Props) {
  const bodyWidth = Math.max(1, terminalWidth - 4);
  const isWrap = wrapMode === 'wrap';

  return (
    <>
      {visibleLineIndices.flatMap(actualLineIndex => {
        const unifiedLine = lines[actualLineIndex];
        if (!unifiedLine) return [];

        const isCurrentLine = actualLineIndex === selectedLine;
        const rowBackground = isCurrentLine ? 'blue' : undefined;

        const fileIdx = perFileIndex[actualLineIndex];
        const hasComment = !!unifiedLine.fileName && fileIdx !== undefined && commentStore.hasComment(fileIdx, unifiedLine.fileName);
        const gutterSymbol = unifiedLine.type === 'added' ? '+ ' : unifiedLine.type === 'removed' ? '- ' : '  ';
        const gutterColor = unifiedLine.type === 'added' || unifiedLine.type === 'removed' ? 'white' : 'gray';
        const bodyPrefix = unifiedLine.type === 'header' ? '' : (hasComment ? '  [C] ' : '  ');
        const isFileHeader = unifiedLine.type === 'header' && unifiedLine.headerType === 'file';
        const isHunkHeader = unifiedLine.type === 'header' && unifiedLine.headerType === 'hunk';
        const bodyColor = isFileHeader ? 'white' : undefined;
        const useSyntax = (unifiedLine.type === 'added' || unifiedLine.type === 'removed') && !isCurrentLine;
        const lineTint = useSyntax ? (unifiedLine.type === 'added' ? 'green' : 'red') : undefined;
        const lineBackground = isFileHeader ? (rowBackground ?? 'gray') : (rowBackground ?? lineTint);

        const isMd = isMarkdownFile(unifiedLine.fileName) && unifiedLine.type !== 'header';
        const mdCtx = isMd ? lookupBlockContext(unifiedLine, 'unified', mdContextMap) : null;

        if (mdCtx) {
          const prefixSpans: Span[] = [{text: bodyPrefix}];
          const rowsSpans = buildMdRows(unifiedLine.text || ' ', mdCtx, bodyWidth, isWrap, prefixSpans);
          return rowsSpans.map((spans, rowIdx) => (
            <Box key={`line-${actualLineIndex}-${rowIdx}`} flexDirection="row" height={1} flexShrink={0}>
              <Text color={gutterColor} backgroundColor={lineBackground} bold={isCurrentLine}>
                {rowIdx === 0 ? gutterSymbol : '  '}
              </Text>
              <MdLineBody spans={spans} width={bodyWidth} lineBg={lineBackground} isCurrentLine={isCurrentLine} />
            </Box>
          ));
        }

        const rawBody = `${bodyPrefix}${unifiedLine.text || ' '}`;

        if (isWrap) {
          const segments = LineWrapper.wrapLine(rawBody, bodyWidth);
          return segments.map((seg, segIdx) => (
            <Box key={`line-${actualLineIndex}-${segIdx}`} flexDirection="row" height={1} flexShrink={0}>
              <Text color={gutterColor} backgroundColor={lineBackground} bold={isCurrentLine}>
                {segIdx === 0 ? gutterSymbol : '  '}
              </Text>
              {useSyntax ? (
                <SyntaxHighlight code={padEndDisplay(seg, bodyWidth)} language={getLanguage(unifiedLine.fileName)} />
              ) : (
                <Text
                  color={bodyColor}
                  dimColor={unifiedLine.type === 'context' || isHunkHeader}
                  backgroundColor={lineBackground}
                  bold={isCurrentLine || isFileHeader}
                  wrap="truncate"
                >
                  {padEndDisplay(seg, bodyWidth)}
                </Text>
              )}
            </Box>
          ));
        }

        const bodyText = fitDisplay(rawBody, bodyWidth);
        return [(
          <Box key={`line-${actualLineIndex}`} flexDirection="row" height={1} flexShrink={0}>
            <Text color={gutterColor} backgroundColor={lineBackground} bold={isCurrentLine}>
              {gutterSymbol}
            </Text>
            {useSyntax ? (
              <SyntaxHighlight code={bodyText} language={getLanguage(unifiedLine.fileName)} />
            ) : (
              <Text
                color={bodyColor}
                dimColor={unifiedLine.type === 'context' || isHunkHeader}
                backgroundColor={lineBackground}
                bold={isCurrentLine || isFileHeader}
                wrap="truncate"
              >
                {bodyText}
              </Text>
            )}
          </Box>
        )];
      })}
    </>
  );
}
