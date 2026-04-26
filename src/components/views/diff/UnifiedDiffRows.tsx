import React from 'react';
import {Box, Text} from 'ink';
import SyntaxHighlight from 'ink-syntax-highlight';
import {padEndDisplay, fitDisplay} from '../../../shared/utils/formatting.js';
import {LineWrapper} from '../../../shared/utils/lineWrapper.js';
import type {CommentStore} from '../../../models.js';
import type {DiffLine, WrapMode} from '../../../shared/utils/diff/types.js';
import {isMarkdownFile, lookupBlockContext, type MdContextMap} from '../../../shared/utils/markdown/diffPrepass.js';
import type {Span} from '../../../shared/utils/markdown/types.js';
import {buildMdRows, MdLine} from './mdRowHelpers.js';

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
              <MdLine spans={spans} width={bodyWidth} background={lineBackground} bold={isCurrentLine} />
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
