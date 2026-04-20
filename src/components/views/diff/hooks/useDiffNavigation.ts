import {useEffect, useRef, useState} from 'react';
import {useInput} from 'ink';
import type {DiffLine, SideBySideLine, ViewMode, WrapMode} from '../../../../shared/utils/diff/types.js';

export type DiffNavigationCallbacks = {
  inputDisabled: boolean;
  commentCount: number;
  onRequestClose: () => void;
  onCommentKey: () => void;
  onToggleShowAllComments: () => void;
  onDeleteComment: () => void;
  onSendComments: () => void;
};

type Params = {
  lines: DiffLine[];
  sideBySideLines: SideBySideLine[];
  viewportRowsRef: React.MutableRefObject<number>;
  callbacksRef: React.MutableRefObject<DiffNavigationCallbacks>;
};

function headerTypeAt(viewMode: ViewMode, lines: DiffLine[], sideBySideLines: SideBySideLine[], i: number): 'file' | 'hunk' | null {
  const pane = viewMode === 'unified' ? lines[i] : sideBySideLines[i]?.left;
  if (!pane || pane.type !== 'header') return null;
  return pane.headerType === 'file' ? 'file' : pane.headerType === 'hunk' ? 'hunk' : null;
}

function findFirstContentLineAfterHeader(viewMode: ViewMode, lines: DiffLine[], sideBySideLines: SideBySideLine[], headerIndex: number): number {
  const maxIndex = (viewMode === 'unified' ? lines : sideBySideLines).length;
  for (let i = headerIndex + 1; i < maxIndex; i++) {
    if (headerTypeAt(viewMode, lines, sideBySideLines, i) === null) return i;
  }
  return Math.min(headerIndex + 1, maxIndex - 1);
}

export function useDiffNavigation({
  lines,
  sideBySideLines,
  viewportRowsRef,
  callbacksRef,
}: Params) {
  const [selectedLine, setSelectedLine] = useState(0);
  const [scrollRow, setScrollRow] = useState(0);
  const [targetScrollRow, setTargetScrollRow] = useState(0);
  const animationIdRef = useRef<NodeJS.Timeout | null>(null);
  const [isFileNavigation, setIsFileNavigation] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('sidebyside');
  const [wrapMode, setWrapMode] = useState<WrapMode>('truncate');
  const [showFileTreeOverlay, setShowFileTreeOverlay] = useState(false);
  const [overlayHighlightedFile, setOverlayHighlightedFile] = useState<string>('');

  const showFileTree = (filePath: string) => {
    setOverlayHighlightedFile(filePath);
    setShowFileTreeOverlay(true);
  };

  useEffect(() => {
    if (scrollRow === targetScrollRow) return;

    if (animationIdRef.current) clearTimeout(animationIdRef.current);

    const distance = Math.abs(targetScrollRow - scrollRow);

    if (distance <= 2) {
      setScrollRow(targetScrollRow);
      animationIdRef.current = null;
      setIsFileNavigation(false);
      return;
    }

    const baseDuration = 200;
    const maxDuration = 400;
    const duration = Math.min(maxDuration, baseDuration + distance * 2);
    const fps = 30;
    const frameTime = 1000 / fps;
    const totalFrames = Math.ceil(duration / frameTime);
    let currentFrame = 0;
    const startRow = scrollRow;
    const deltaRow = targetScrollRow - startRow;

    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

    let cancelled = false;

    const animate = () => {
      if (cancelled) return;
      currentFrame++;
      const progress = Math.min(currentFrame / totalFrames, 1);
      const easedProgress = easeOutCubic(progress);
      const newRow = Math.round(startRow + deltaRow * easedProgress);
      setScrollRow(newRow);

      if (progress < 1 && !cancelled) {
        animationIdRef.current = setTimeout(animate, frameTime);
      } else {
        animationIdRef.current = null;
        setIsFileNavigation(false);
      }
    };

    animationIdRef.current = setTimeout(animate, frameTime);

    return () => {
      cancelled = true;
      if (animationIdRef.current) clearTimeout(animationIdRef.current);
    };
  }, [targetScrollRow]);

  useEffect(() => {
    return () => {
      if (animationIdRef.current) clearTimeout(animationIdRef.current);
    };
  }, []);

  useInput((input, key) => {
    const cb = callbacksRef.current;
    if (cb.inputDisabled) return;

    if (showFileTreeOverlay && !((key.shift || key.ctrl) && (key.upArrow || key.downArrow))) {
      setShowFileTreeOverlay(false);
    }

    if (key.escape || input === 'q') {
      cb.onRequestClose();
      return;
    }

    const currentLines = viewMode === 'unified' ? lines : sideBySideLines;
    const maxLineIndex = Math.max(0, currentLines.length - 1);

    if ((key.upArrow || input === 'k') && !key.shift && !key.ctrl) {
      setSelectedLine(prev => Math.max(0, prev - 1));
    }
    if ((key.downArrow || input === 'j') && !key.shift && !key.ctrl) {
      setSelectedLine(prev => Math.min(maxLineIndex, prev + 1));
    }
    if (key.pageUp || input === 'b') {
      setSelectedLine(prev => Math.max(0, prev - Math.floor(viewportRowsRef.current / 2)));
    }
    if (key.pageDown || input === 'f' || input === ' ') {
      setSelectedLine(prev => Math.min(maxLineIndex, prev + Math.floor(viewportRowsRef.current / 2)));
    }
    if (input === 'g') setSelectedLine(0);
    if (input === 'G') setSelectedLine(maxLineIndex);

    if (input === 'v') {
      setViewMode(current => current === 'unified' ? 'sidebyside' : 'unified');
    }

    if (input === 'w') {
      setWrapMode(current => current === 'truncate' ? 'wrap' : 'truncate');
    }

    if (input === 'c') cb.onCommentKey();
    if (input === 'C') cb.onToggleShowAllComments();
    if (input === 'd') cb.onDeleteComment();

    if ((input === 'S' || input === 's') && cb.commentCount > 0) {
      cb.onSendComments();
    }

    if (key.leftArrow) {
      for (let i = selectedLine - 1; i >= 0; i--) {
        if (headerTypeAt(viewMode, lines, sideBySideLines, i) === 'hunk') {
          setSelectedLine(i);
          break;
        }
      }
    }

    if (key.rightArrow) {
      const maxIndex = viewMode === 'unified' ? lines.length : sideBySideLines.length;
      for (let i = selectedLine + 1; i < maxIndex; i++) {
        if (headerTypeAt(viewMode, lines, sideBySideLines, i) === 'hunk') {
          setSelectedLine(i);
          break;
        }
      }
    }

    const jumpToFileHeader = (headerIndex: number) => {
      const contentLineIndex = findFirstContentLineAfterHeader(viewMode, lines, sideBySideLines, headerIndex);
      setSelectedLine(contentLineIndex);
      const fileName = viewMode === 'unified'
        ? (lines[headerIndex]?.fileName || '')
        : (sideBySideLines[headerIndex]?.left?.fileName || sideBySideLines[headerIndex]?.right?.fileName || '');
      if (fileName) showFileTree(fileName);
      setIsFileNavigation(true);
      setTargetScrollRow(Math.max(0, contentLineIndex));
    };

    if ((key.upArrow && (key.shift || key.ctrl)) || input === 'p') {
      let currentFileHeaderIndex = -1;
      for (let i = selectedLine; i >= 0; i--) {
        if (headerTypeAt(viewMode, lines, sideBySideLines, i) === 'file') { currentFileHeaderIndex = i; break; }
      }
      const searchStart = currentFileHeaderIndex > 0 ? currentFileHeaderIndex - 1 : selectedLine - 1;
      for (let i = searchStart; i >= 0; i--) {
        if (headerTypeAt(viewMode, lines, sideBySideLines, i) === 'file') { jumpToFileHeader(i); break; }
      }
    }

    if ((key.downArrow && (key.shift || key.ctrl)) || input === 'n') {
      const maxIndex = viewMode === 'unified' ? lines.length : sideBySideLines.length;
      for (let i = selectedLine + 1; i < maxIndex; i++) {
        if (headerTypeAt(viewMode, lines, sideBySideLines, i) === 'file') { jumpToFileHeader(i); break; }
      }
    }
  });

  return {
    selectedLine,
    setSelectedLine,
    scrollRow,
    setScrollRow,
    targetScrollRow,
    setTargetScrollRow,
    isFileNavigation,
    viewMode,
    wrapMode,
    showFileTreeOverlay,
    overlayHighlightedFile,
  };
}
