import React from 'react';
import {Box, Text} from 'ink';
import SyntaxHighlight from 'ink-syntax-highlight';
import {padEndDisplay, truncateDisplay} from '../../../shared/utils/formatting.js';
import {LineWrapper} from '../../../shared/utils/lineWrapper.js';
import type {CommentStore} from '../../../models.js';
import type {DiffLine, SideBySideLine, WrapMode} from '../../../shared/utils/diff/types.js';
import {isMarkdownFile, lookupBlockContext, type MdContextMap} from '../../../shared/utils/markdown/diffPrepass.js';
import type {Span} from '../../../shared/utils/markdown/types.js';
import {buildMdRows, MdLine} from './mdRowHelpers.js';

type Props = {
  lines: SideBySideLine[];
  visibleLineIndices: number[];
  selectedLine: number;
  terminalWidth: number;
  wrapMode: WrapMode;
  perFileIndex: (number | undefined)[];
  commentStore: CommentStore;
  getLanguage: (fileName: string | undefined) => string;
  mdContextMap: MdContextMap;
};

type PaneRender = {
  segments: string[];
  /** When set, replaces `segments`: each entry is a row's pre-styled spans. */
  spanRows?: Span[][];
  color?: string;
  dimColor?: boolean;
  bold?: boolean;
  useSyntax?: boolean;
  language?: string;
  backgroundColor?: string;
};

export default function SideBySideDiffRows({
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
  const paneWidth = Math.max(1, Math.floor((terminalWidth - 2) / 2));
  const isWrap = wrapMode === 'wrap';

  const formatPaneSegments = (
    pane: SideBySideLine['left'] | SideBySideLine['right'],
    side: 'left' | 'right',
    prefix: string,
    isCurrentLine: boolean,
  ): PaneRender => {
    if (!pane) {
      return {segments: [padEndDisplay('', paneWidth)], dimColor: true};
    }

    if (pane.type !== 'header' && pane.type !== 'empty' && isMarkdownFile(pane.fileName)) {
      const fakeLine: DiffLine = {
        type: pane.type === 'context' ? 'context' : (side === 'left' ? 'removed' : 'added'),
        text: pane.text,
        fileName: pane.fileName,
        oldLineIndex: pane.oldLineIndex,
        newLineIndex: pane.newLineIndex,
      };
      const ctx = lookupBlockContext(fakeLine, side, mdContextMap);
      if (ctx) {
        const prefixSpans: Span[] = [{text: prefix}];
        const spanRows = buildMdRows(pane.text || ' ', ctx, paneWidth, isWrap, prefixSpans);
        if (spanRows.length > 0) {
          return {segments: [], spanRows, bold: isCurrentLine};
        }
      }
    }

    const raw = `${prefix}${pane.text || ' '}`;
    const segs = isWrap
      ? LineWrapper.wrapLine(raw, paneWidth)
      : [truncateDisplay(raw, paneWidth)];

    const paddedSegs = segs.map(s => padEndDisplay(s, paneWidth));

    if (pane.type === 'header') {
      return pane.headerType === 'file'
        ? {segments: paddedSegs, color: 'white', bold: true, backgroundColor: 'gray'}
        : {segments: paddedSegs, dimColor: true};
    }
    if (pane.type === 'context' || pane.type === 'empty') {
      return {segments: paddedSegs, dimColor: true, bold: isCurrentLine};
    }
    return {segments: paddedSegs, useSyntax: !isCurrentLine, language: getLanguage(pane.fileName), bold: isCurrentLine};
  };

  return (
    <>
      {visibleLineIndices.flatMap(actualLineIndex => {
        const sideBySideLine = lines[actualLineIndex];
        if (!sideBySideLine) return [];

        const isCurrentLine = actualLineIndex === selectedLine;
        const rowBackground = isCurrentLine ? 'blue' : undefined;

        const fileForComment = sideBySideLine.right?.fileName || sideBySideLine.left?.fileName || '';
        const indexForComment = perFileIndex[actualLineIndex];
        const hasComment = !!fileForComment && indexForComment !== undefined && commentStore.hasComment(indexForComment, fileForComment);

        const isHeaderLine = sideBySideLine.left?.type === 'header' || sideBySideLine.right?.type === 'header';
        const leftPane = formatPaneSegments(sideBySideLine.left, 'left', isHeaderLine ? ' ' : (hasComment ? '  [C] ' : '  '), isCurrentLine);
        const rightPane = formatPaneSegments(sideBySideLine.right, 'right', isHeaderLine ? ' ' : '  ', isCurrentLine);
        const leftRowCount = leftPane.spanRows ? leftPane.spanRows.length : leftPane.segments.length;
        const rightRowCount = rightPane.spanRows ? rightPane.spanRows.length : rightPane.segments.length;
        const numRows = Math.max(leftRowCount, rightRowCount);
        const emptyLeft = padEndDisplay('', paneWidth);
        const emptyRight = padEndDisplay('', paneWidth);

        return Array.from({length: numRows}, (_, rowIdx) => (
          <Box key={`line-${actualLineIndex}-${rowIdx}`} flexDirection="row" height={1} flexShrink={0}>
            {leftPane.spanRows ? (
              <MdLine spans={leftPane.spanRows[rowIdx] ?? []} width={paneWidth} background={rowBackground ?? leftPane.backgroundColor} bold={isCurrentLine} />
            ) : leftPane.useSyntax ? (
              <SyntaxHighlight code={leftPane.segments[rowIdx] ?? emptyLeft} language={leftPane.language} />
            ) : (
              <Text
                color={leftPane.color}
                dimColor={leftPane.dimColor}
                backgroundColor={rowBackground ?? leftPane.backgroundColor}
                bold={leftPane.bold}
                wrap="truncate"
              >
                {leftPane.segments[rowIdx] ?? emptyLeft}
              </Text>
            )}
            {rightPane.spanRows ? (
              <MdLine spans={rightPane.spanRows[rowIdx] ?? []} width={paneWidth} background={rowBackground ?? rightPane.backgroundColor} bold={isCurrentLine} />
            ) : rightPane.useSyntax ? (
              <SyntaxHighlight code={rightPane.segments[rowIdx] ?? emptyRight} language={rightPane.language} />
            ) : (
              <Text
                color={rightPane.color}
                dimColor={rightPane.dimColor}
                backgroundColor={rowBackground ?? rightPane.backgroundColor}
                bold={rightPane.bold}
                wrap="truncate"
              >
                {rightPane.segments[rowIdx] ?? emptyRight}
              </Text>
            )}
          </Box>
        ));
      })}
    </>
  );
}
