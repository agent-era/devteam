import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text} from 'ink';
import {useTerminalDimensions} from '../../hooks/useTerminalDimensions.js';
import CommentInputDialog from '../dialogs/CommentInputDialog.js';
import SessionWaitingDialog from '../dialogs/SessionWaitingDialog.js';
import UnsubmittedCommentsDialog from '../dialogs/UnsubmittedCommentsDialog.js';
import FileTreeOverlay from '../dialogs/FileTreeOverlay.js';
import {truncateDisplay, fitDisplay} from '../../shared/utils/formatting.js';
import AnnotatedText from '../common/AnnotatedText.js';
import {LineWrapper} from '../../shared/utils/lineWrapper.js';
import {ViewportCalculator} from '../../shared/utils/viewport.js';
import {computeUnifiedPerFileIndices, computeSideBySidePerFileIndices} from '../../shared/utils/diffLineIndex.js';
import {calculateDiffViewportRows} from '../../shared/utils/layout.js';
import {getLanguageFromFileName} from '../../shared/utils/languageMapping.js';
import {loadDiff} from '../../shared/utils/diff/loadDiff.js';
import {convertToSideBySide} from '../../shared/utils/diff/convertToSideBySide.js';
import type {DiffLine, SideBySideLine} from '../../shared/utils/diff/types.js';
import UnifiedDiffRows from './diff/UnifiedDiffRows.js';
import SideBySideDiffRows from './diff/SideBySideDiffRows.js';
import {useDiffComments} from './diff/hooks/useDiffComments.js';
import {useDiffNavigation, type DiffNavigationCallbacks} from './diff/hooks/useDiffNavigation.js';

type Props = {
  worktreePath: string;
  title?: string;
  onClose: () => void;
  diffType?: 'full' | 'uncommitted';
  onAttachToSession?: (sessionName: string) => void;
  workspaceFeature?: string;
};

export default function DiffView({worktreePath, title = 'Diff Viewer', onClose, diffType = 'full', onAttachToSession, workspaceFeature}: Props) {
  const {rows: terminalHeight, columns: terminalWidth} = useTerminalDimensions();
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [sideBySideLines, setSideBySideLines] = useState<SideBySideLine[]>([]);
  const [currentFileHeader, setCurrentFileHeader] = useState<string>('');
  const [currentHunkHeader, setCurrentHunkHeader] = useState<string>('');

  const unifiedPerFileIndex = useMemo(() => computeUnifiedPerFileIndices(lines as any), [lines]);
  const sideBySidePerFileIndex = useMemo(() => computeSideBySidePerFileIndices(sideBySideLines as any), [sideBySideLines]);

  const diffFiles = useMemo(() => {
    const seen = new Set<string>();
    const files: string[] = [];
    for (const l of lines) {
      if (l.type === 'header' && l.headerType === 'file' && l.fileName && !seen.has(l.fileName)) {
        seen.add(l.fileName);
        files.push(l.fileName);
      }
    }
    return files;
  }, [lines]);

  const noop = () => {};
  const callbacksRef = useRef<DiffNavigationCallbacks>({
    inputDisabled: false, commentCount: 0,
    onRequestClose: noop, onCommentKey: noop, onToggleShowAllComments: noop, onDeleteComment: noop, onSendComments: noop,
  });
  const viewportRowsRef = useRef(0);

  const nav = useDiffNavigation({lines, sideBySideLines, viewportRowsRef, callbacksRef});

  const comments = useDiffComments({
    worktreePath, diffType, workspaceFeature, onClose, onAttachToSession,
    viewMode: nav.viewMode, lines, sideBySideLines, selectedLine: nav.selectedLine,
    unifiedPerFileIndex, sideBySidePerFileIndex,
  });

  useEffect(() => {
    if (!comments.baseHashReady) return;
    (async () => {
      const lns = await loadDiff(worktreePath, diffType, diffType === 'full' ? comments.baseCommitHash : undefined);
      setLines(lns);
      setSideBySideLines(convertToSideBySide(lns));
      nav.setScrollRow(0);
      nav.setTargetScrollRow(0);
      nav.setSelectedLine(0);
    })();
  }, [worktreePath, diffType, comments.baseCommitHash, comments.baseHashReady]);

  const overlayAreaHeight = nav.showFileTreeOverlay ? Math.max(6, Math.floor(terminalHeight / 2)) : 0;
  const showCommentSummary = comments.showAllComments && comments.commentStore.count > 0;
  const viewportRows = useMemo(() => calculateDiffViewportRows(terminalHeight, {
    hasFileHeader: !!currentFileHeader,
    hasHunkHeader: !!currentHunkHeader,
    showCommentSummary,
    overlayHeight: overlayAreaHeight,
  }), [terminalHeight, currentFileHeader, currentHunkHeader, showCommentSummary, overlayAreaHeight]);

  viewportRowsRef.current = viewportRows;

  callbacksRef.current = {
    inputDisabled: comments.anyDialogOpen,
    commentCount: comments.commentStore.count,
    onRequestClose: comments.requestClose,
    onCommentKey: comments.tryOpenCommentDialog,
    onToggleShowAllComments: comments.toggleShowAllComments,
    onDeleteComment: comments.deleteCurrentComment,
    onSendComments: () => {
      comments.sendCommentsToTmux().catch(error => {
        console.error('Failed to send comments:', error);
      });
    },
  };

  const maxWidth = nav.viewMode === 'unified' ? terminalWidth - 2 : Math.floor((terminalWidth - 1) / 2) - 2;

  const textLines = useMemo(() => {
    const currentLines = nav.viewMode === 'unified' ? lines : sideBySideLines;
    return currentLines.map(line => {
      if (nav.viewMode === 'unified') {
        return (line as DiffLine).text || ' ';
      }
      const sbsLine = line as SideBySideLine;
      const leftText = sbsLine.left?.text || '';
      const rightText = sbsLine.right?.text || '';
      const leftH = LineWrapper.calculateHeight(leftText, maxWidth);
      const rightH = LineWrapper.calculateHeight(rightText, maxWidth);
      return leftH >= rightH ? leftText : rightText;
    });
  }, [lines, sideBySideLines, nav.viewMode, maxWidth]);

  useEffect(() => {
    const newScrollRow = ViewportCalculator.calculateScrollToShowLine(
      textLines,
      nav.selectedLine,
      nav.targetScrollRow,
      viewportRows,
      maxWidth,
      nav.wrapMode,
    );
    if (newScrollRow !== nav.targetScrollRow && !nav.isFileNavigation) {
      const maxScrollRow = ViewportCalculator.getMaxScrollRow(textLines, viewportRows, maxWidth, nav.wrapMode);
      nav.setTargetScrollRow(Math.max(0, Math.min(maxScrollRow, newScrollRow)));
    }
  }, [nav.selectedLine, textLines, viewportRows, maxWidth, nav.targetScrollRow, nav.isFileNavigation, nav.wrapMode]);

  const viewport = useMemo(() =>
    ViewportCalculator.calculate(textLines, nav.selectedLine, nav.scrollRow, viewportRows, maxWidth, nav.wrapMode),
  [textLines, nav.selectedLine, nav.scrollRow, viewportRows, maxWidth, nav.wrapMode]);

  useEffect(() => {
    const currentLines = nav.viewMode === 'unified' ? lines : sideBySideLines;
    if (currentLines.length === 0) {
      setCurrentFileHeader('');
      setCurrentHunkHeader('');
      return;
    }
    let fileHeader = '';
    let hunkHeader = '';
    for (let i = viewport.firstVisibleLine - 1; i >= 0; i--) {
      const pane = nav.viewMode === 'unified' ? lines[i] : sideBySideLines[i]?.left;
      if (!pane || pane.type !== 'header') continue;
      if (pane.headerType === 'file') { fileHeader = pane.text; break; }
      if (!hunkHeader && pane.headerType === 'hunk') hunkHeader = pane.text;
    }
    setCurrentFileHeader(fileHeader);
    setCurrentHunkHeader(hunkHeader);
  }, [viewport, lines, sideBySideLines, nav.viewMode]);

  const languageCache = useMemo(() => {
    const cache = new Map<string | undefined, string>();
    return (fileName: string | undefined) => {
      if (!cache.has(fileName)) cache.set(fileName, getLanguageFromFileName(fileName));
      return cache.get(fileName)!;
    };
  }, []);

  if (comments.showUnsubmittedCommentsDialog) {
    return (
      <Box flexDirection="column" height={terminalHeight} justifyContent="center" alignItems="center">
        <UnsubmittedCommentsDialog
          commentCount={comments.commentStore.count}
          onSubmit={comments.handleUnsubmittedCommentsSubmit}
          onExitWithoutSubmitting={comments.handleUnsubmittedCommentsExitWithoutSubmitting}
          onCancel={comments.handleUnsubmittedCommentsCancel}
        />
      </Box>
    );
  }

  if (comments.showSessionWaitingDialog) {
    return (
      <Box flexDirection="column" height={terminalHeight} justifyContent="center" alignItems="center">
        <SessionWaitingDialog
          sessionName={comments.sessionWaitingInfo.sessionName}
          onGoToSession={comments.handleSessionWaitingGoToSession}
          onCancel={comments.handleSessionWaitingCancel}
        />
      </Box>
    );
  }

  if (comments.showCommentDialog) {
    const sl = nav.selectedLine;
    const isUnified = nav.viewMode === 'unified';
    const uLine = lines[sl];
    const sLine = sideBySideLines[sl];
    const fileName = isUnified ? (uLine?.fileName || '') : (sLine?.right?.fileName || sLine?.left?.fileName || '');
    const lineText = isUnified ? (uLine?.text || '') : (sLine?.right?.text || sLine?.left?.text || '');
    const isRemoved = isUnified ? uLine?.type === 'removed' : sLine?.left?.type === 'removed';
    const pfi = isUnified ? unifiedPerFileIndex[sl] : sideBySidePerFileIndex[sl];
    const initialComment = fileName && pfi !== undefined ? (comments.commentStore.getComment(pfi, fileName)?.commentText || '') : '';
    return (
      <Box flexDirection="column" height={terminalHeight} justifyContent="center" alignItems="center">
        <CommentInputDialog
          fileName={fileName}
          lineText={lineText}
          isRemoved={isRemoved}
          initialComment={initialComment}
          onSave={comments.handleCommentSave}
          onCancel={comments.handleCommentCancel}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold wrap="truncate">{title}</Text>
      {currentFileHeader && (
        <Text color="white" bold backgroundColor="gray" wrap="truncate">
          {fitDisplay(` ${currentFileHeader}`, terminalWidth)}
        </Text>
      )}
      {currentHunkHeader && (
        <Text dimColor wrap="truncate">
          {fitDisplay(currentHunkHeader, terminalWidth)}
        </Text>
      )}
      <Box flexDirection="column" height={viewportRows}>
        {nav.viewMode === 'unified' ? (
          <UnifiedDiffRows
            lines={lines}
            visibleLineIndices={viewport.visibleLines}
            selectedLine={nav.selectedLine}
            terminalWidth={terminalWidth}
            wrapMode={nav.wrapMode}
            perFileIndex={unifiedPerFileIndex}
            commentStore={comments.commentStore}
            getLanguage={languageCache}
          />
        ) : (
          <SideBySideDiffRows
            lines={sideBySideLines}
            visibleLineIndices={viewport.visibleLines}
            selectedLine={nav.selectedLine}
            terminalWidth={terminalWidth}
            wrapMode={nav.wrapMode}
            perFileIndex={sideBySidePerFileIndex}
            commentStore={comments.commentStore}
            getLanguage={languageCache}
          />
        )}
      </Box>

      {showCommentSummary && (
        <Text color="blue" wrap="truncate">
          {truncateDisplay(`Comments (${comments.commentStore.count}): ${comments.commentStore.getAllComments().map(c => `${c.fileName}:${c.lineIndex ?? '-'} ${c.commentText}`).join(' | ')}`, terminalWidth)}
        </Text>
      )}

      {!nav.showFileTreeOverlay && (
        <AnnotatedText
          color="magenta"
          wrap="truncate"
          text={truncateDisplay(`Shift+↑/↓ or [p]/[n] prev/next file  [v]iew (${nav.viewMode})  [w]rap (${nav.wrapMode})  [c]omment  [C] show all  [d]elete  [S]end to agent  [q] close`, terminalWidth)}
        />
      )}

      {nav.showFileTreeOverlay && (
        <Box flexDirection="row" marginTop={0}>
          <FileTreeOverlay
            files={diffFiles}
            highlightedFile={nav.overlayHighlightedFile}
            maxWidth={terminalWidth}
            maxHeight={overlayAreaHeight}
            overlayWidth={Math.max(30, Math.floor(terminalWidth / 2))}
            overlayHeight={overlayAreaHeight}
            title="Files in Diff"
          />
        </Box>
      )}
    </Box>
  );
}
