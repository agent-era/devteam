import React from 'react';
import {Box, Text} from 'ink';
import SyntaxHighlight from 'ink-syntax-highlight';
import {padEndDisplay, truncateDisplay} from '../../../shared/utils/formatting.js';
import {LineWrapper} from '../../../shared/utils/lineWrapper.js';
import type {CommentStore} from '../../../models.js';
import type {SideBySideLine, WrapMode} from '../../../shared/utils/diff/types.js';

type Props = {
  lines: SideBySideLine[];
  visibleLineIndices: number[];
  selectedLine: number;
  terminalWidth: number;
  wrapMode: WrapMode;
  perFileIndex: (number | undefined)[];
  commentStore: CommentStore;
  getLanguage: (fileName: string | undefined) => string;
};

type PaneRender = {
  segments: string[];
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
}: Props) {
  const paneWidth = Math.max(1, Math.floor((terminalWidth - 2) / 2));
  const isWrap = wrapMode === 'wrap';

  const formatPaneSegments = (
    pane: SideBySideLine['left'] | SideBySideLine['right'],
    prefix: string,
    isCurrentLine: boolean,
  ): PaneRender => {
    if (!pane) {
      return {segments: [padEndDisplay('', paneWidth)], dimColor: true};
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
        const leftPane = formatPaneSegments(sideBySideLine.left, isHeaderLine ? ' ' : (hasComment ? '  [C] ' : '  '), isCurrentLine);
        const rightPane = formatPaneSegments(sideBySideLine.right, isHeaderLine ? ' ' : '  ', isCurrentLine);
        const numRows = Math.max(leftPane.segments.length, rightPane.segments.length);
        const emptyLeft = padEndDisplay('', paneWidth);
        const emptyRight = padEndDisplay('', paneWidth);

        return Array.from({length: numRows}, (_, rowIdx) => (
          <Box key={`line-${actualLineIndex}-${rowIdx}`} flexDirection="row" height={1} flexShrink={0}>
            {leftPane.useSyntax ? (
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
            {rightPane.useSyntax ? (
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
