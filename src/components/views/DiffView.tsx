import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import SyntaxHighlight from 'ink-syntax-highlight';
import {runCommandAsync, runCommand} from '../../shared/utils/commandExecutor.js';
import {findBaseBranch} from '../../shared/utils/gitHelpers.js';
import {useTerminalDimensions} from '../../hooks/useTerminalDimensions.js';
import {BASE_BRANCH_CANDIDATES} from '../../constants.js';
import {CommentStore} from '../../models.js';
import {commentStoreManager} from '../../services/CommentStoreManager.js';
import {TmuxService} from '../../services/TmuxService.js';
import CommentInputDialog from '../dialogs/CommentInputDialog.js';
import SessionWaitingDialog from '../dialogs/SessionWaitingDialog.js';
import UnsubmittedCommentsDialog from '../dialogs/UnsubmittedCommentsDialog.js';
import FileTreeOverlay from '../dialogs/FileTreeOverlay.js';
import {truncateDisplay, padEndDisplay, fitDisplay} from '../../shared/utils/formatting.js';
import AnnotatedText from '../common/AnnotatedText.js';
import {LineWrapper} from '../../shared/utils/lineWrapper.js';
import {ViewportCalculator} from '../../shared/utils/viewport.js';
import {computeUnifiedPerFileIndices, computeSideBySidePerFileIndices} from '../../shared/utils/diffLineIndex.js';
import {calculateDiffViewportRows} from '../../shared/utils/layout.js';
import {getLanguageFromFileName} from '../../shared/utils/languageMapping.js';

type DiffLine = {
  type: 'added'|'removed'|'context'|'header';
  text: string;
  fileName?: string;
  headerType?: 'file' | 'hunk';
  oldLineIndex?: number; // 1-based original (left) line number from diff output
  newLineIndex?: number; // 1-based current (right) line number from diff output
};

type SideBySideLine = {
  left: {type: 'removed'|'context'|'header'|'empty'; text: string; fileName?: string; headerType?: 'file' | 'hunk'; oldLineIndex?: number; newLineIndex?: number} | null;
  right: {type: 'added'|'context'|'header'|'empty'; text: string; fileName?: string; headerType?: 'file' | 'hunk'; oldLineIndex?: number; newLineIndex?: number} | null;
  lineIndex: number; // Original line index for comments and navigation
};

// Map file extensions to language identifiers for syntax highlighting is now in shared util

async function loadDiff(worktreePath: string, diffType: 'full' | 'uncommitted' = 'full', baseCommitHash?: string): Promise<DiffLine[]> {
  let diff: string | null = null;
  
  if (diffType === 'uncommitted') {
    // Show only uncommitted changes (working directory vs HEAD)
    diff = await runCommandAsync(['git', '-C', worktreePath, 'diff', '--no-color', '--no-ext-diff', 'HEAD']);
  } else {
    // Show full diff against base branch (default behavior)
    let target = baseCommitHash;
    if (!target) {
      target = 'HEAD~1';
      const base = findBaseBranch(worktreePath, BASE_BRANCH_CANDIDATES);
      if (base) {
        const mb = await runCommandAsync(['git', '-C', worktreePath, 'merge-base', 'HEAD', base]);
        if (mb) target = mb.trim();
      }
    }
    diff = await runCommandAsync(['git', '-C', worktreePath, 'diff', '--no-color', '--no-ext-diff', target]);
  }
  
  // Collect files and their content
  const fileContents = new Map<string, DiffLine[]>();
  
  // Process main diff if it exists
  if (diff && diff.trim()) {
    const raw = diff.split('\n');
    let currentFileName = '';
    let currentFileLines: DiffLine[] = [];
    let oldLineCounter = 1;
    let newLineCounter = 1;
    
    for (const line of raw) {
      if (line.startsWith('diff --git')) {
        // Save previous file if it exists
        if (currentFileName && currentFileLines.length > 0) {
          fileContents.set(currentFileName, currentFileLines);
        }
        
        // Start new file
        const parts = line.split(' ');
        const fp = parts[3]?.slice(2) || parts[2]?.slice(2) || '';
        currentFileName = fp;
        currentFileLines = [];
        currentFileLines.push({type: 'header', text: `📁 ${fp}`, fileName: fp, headerType: 'file'});
        oldLineCounter = 1;
        newLineCounter = 1;
      } else if (line.startsWith('@@')) {
        // Parse original and new starting line numbers from hunk header
        const m = line.match(/^@@ -([0-9]+)(?:,([0-9]+))? \+([0-9]+)(?:,([0-9]+))? @@/);
        if (m) {
          const oldStart = parseInt(m[1] || '1', 10);
          const newStart = parseInt(m[3] || '1', 10);
          oldLineCounter = Math.max(1, oldStart);
          newLineCounter = Math.max(1, newStart);
        }
        const ctx = line.replace(/^@@.*@@ ?/, '');
        if (ctx) currentFileLines.push({type: 'header', text: ` ▼ ${ctx}`, fileName: currentFileName, headerType: 'hunk'});
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFileLines.push({type: 'added', text: line.slice(1), fileName: currentFileName, newLineIndex: newLineCounter});
        newLineCounter++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentFileLines.push({type: 'removed', text: line.slice(1), fileName: currentFileName, oldLineIndex: oldLineCounter});
        oldLineCounter++;
      } else if (line.startsWith(' ')) {
        currentFileLines.push({type: 'context', text: line.slice(1), fileName: currentFileName, oldLineIndex: oldLineCounter, newLineIndex: newLineCounter});
        oldLineCounter++;
        newLineCounter++;
      } else if (line === '') {
        currentFileLines.push({type: 'context', text: ' ', fileName: currentFileName}); // Empty line gets a space so cursor is visible
      }
    }
    
    // Save last file
    if (currentFileName && currentFileLines.length > 0) {
      fileContents.set(currentFileName, currentFileLines);
    }
  }
  
  // Process untracked files
  const untracked = await runCommandAsync(['git', '-C', worktreePath, 'ls-files', '--others', '--exclude-standard']);
  if (untracked) {
    for (const fp of untracked.split('\n').filter(Boolean)) {
      const fileLines: DiffLine[] = [];
      fileLines.push({type: 'header', text: `📁 ${fp} (new file)`, fileName: fp, headerType: 'file'});
      try {
        const cat = await runCommandAsync(['bash', '-lc', `cd ${JSON.stringify(worktreePath)} && sed -n '1,200p' ${JSON.stringify(fp)}`]);
        for (const l of (cat || '').split('\n')) {
          // Keep all lines including empty ones to faithfully render blank lines
          fileLines.push({type: 'added', text: l, fileName: fp});
        }
      } catch {}
      fileContents.set(fp, fileLines);
    }
  }
  
  // Sort files alphabetically and combine their content
  const sortedFiles = Array.from(fileContents.keys()).sort();
  const lines: DiffLine[] = [];
  
  for (const fileName of sortedFiles) {
    const fileLines = fileContents.get(fileName);
    if (fileLines) {
      lines.push(...fileLines);
    }
  }
  
  return lines;
}

function convertToSideBySide(unifiedLines: DiffLine[]): SideBySideLine[] {
  const sideBySideLines: SideBySideLine[] = [];
  let lineIndex = 0;
  let i = 0;

  while (i < unifiedLines.length) {
    const line = unifiedLines[i];
    
    if (line.type === 'header') {
      // Headers appear on both sides
      sideBySideLines.push({
        left: {type: 'header', text: line.text, fileName: line.fileName, headerType: line.headerType},
        right: {type: 'header', text: line.text, fileName: line.fileName, headerType: line.headerType},
        lineIndex: lineIndex++
      });
      i++;
    } else if (line.type === 'context') {
      // Context lines appear on both sides
      sideBySideLines.push({
        left: {type: 'context', text: line.text, fileName: line.fileName, oldLineIndex: line.oldLineIndex, newLineIndex: line.newLineIndex},
        right: {type: 'context', text: line.text, fileName: line.fileName, oldLineIndex: line.oldLineIndex, newLineIndex: line.newLineIndex},
        lineIndex: lineIndex++
      });
      i++;
    } else if (line.type === 'removed') {
      // Collect all consecutive removed lines
      const removedLines: DiffLine[] = [];
      while (i < unifiedLines.length && unifiedLines[i].type === 'removed') {
        removedLines.push(unifiedLines[i]);
        i++;
      }
      
      // Collect all consecutive added lines that follow
      const addedLines: DiffLine[] = [];
      while (i < unifiedLines.length && unifiedLines[i].type === 'added') {
        addedLines.push(unifiedLines[i]);
        i++;
      }
      
      // Pair them up, filling with empty lines as needed
      const maxLines = Math.max(removedLines.length, addedLines.length);
      
      for (let j = 0; j < maxLines; j++) {
        const removedLine = removedLines[j] || null;
        const addedLine = addedLines[j] || null;
        
        sideBySideLines.push({
          left: removedLine ? {type: 'removed', text: removedLine.text, fileName: removedLine.fileName, oldLineIndex: removedLine.oldLineIndex} : {type: 'empty', text: '', fileName: line.fileName},
          right: addedLine ? {type: 'added', text: addedLine.text, fileName: addedLine.fileName, newLineIndex: addedLine.newLineIndex} : {type: 'empty', text: '', fileName: line.fileName},
          lineIndex: lineIndex++
        });
      }
    } else if (line.type === 'added') {
      // Added lines without preceding removed lines
      sideBySideLines.push({
        left: {type: 'empty', text: '', fileName: line.fileName},
        right: {type: 'added', text: line.text, fileName: line.fileName, newLineIndex: line.newLineIndex},
        lineIndex: lineIndex++
      });
      i++;
    } else {
      i++;
    }
  }

  return sideBySideLines;
}


type Props = {
  worktreePath: string;
  title?: string;
  onClose: () => void;
  diffType?: 'full' | 'uncommitted';
  onAttachToSession?: (sessionName: string) => void;
  // When viewing a workspace child repo, route comments to the top-level workspace session
  workspaceFeature?: string;
};

type ViewMode = 'unified' | 'sidebyside';
type WrapMode = 'truncate' | 'wrap';

// Exported utility for formatting comments into a Claude-friendly prompt
export function formatCommentsAsPrompt(
  comments: any[],
  opts?: {workspaceFeature?: string; project?: string; baseCommitHash?: string}
): string {
  let prompt = "Please address the following code review comments:\n\n";
  if (opts?.workspaceFeature && opts?.project) {
    prompt += `Context: In workspace '${opts.workspaceFeature}', target child directory: ./${opts.project}\n\n`;
  }

  const commentsByFile: {[key: string]: typeof comments} = {};
  comments.forEach(comment => {
    if (!commentsByFile[comment.fileName]) {
      commentsByFile[comment.fileName] = [];
    }
    commentsByFile[comment.fileName].push(comment);
  });

  Object.entries(commentsByFile).forEach(([fileName, fileComments]) => {
    const header = opts?.baseCommitHash ? `File: ${fileName}@${opts.baseCommitHash}` : `File: ${fileName}`;
    prompt += `${header}\n`;
    fileComments.forEach(comment => {
      if (comment.lineIndex !== undefined) {
        // Normal line with line number
        prompt += `  Line ${comment.lineIndex + 1}: ${comment.lineText}\n`;
      } else if (
        comment.lineText &&
        comment.lineText.trim().length > 0 &&
        !comment.isFileLevel
      ) {
        // Removed line or other content - show as removed; include original number when available
        if (comment.isRemoved && comment.originalLineIndex !== undefined) {
          prompt += `  Removed line ${comment.originalLineIndex}: ${comment.lineText}\n`;
        } else {
          prompt += `  Removed line: ${comment.lineText}\n`;
        }
      }
      // For file headers (no meaningful lineText), just show the comment
      prompt += `  Comment: ${comment.commentText}\n`;
    });
    prompt += "\n";
  });

  return prompt;
}

export default function DiffView({worktreePath, title = 'Diff Viewer', onClose, diffType = 'full', onAttachToSession, workspaceFeature}: Props) {
  const {rows: terminalHeight, columns: terminalWidth} = useTerminalDimensions();
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [sideBySideLines, setSideBySideLines] = useState<SideBySideLine[]>([]);
  const [selectedLine, setSelectedLine] = useState(0);
  const [scrollRow, setScrollRow] = useState(0);
  
  const [targetScrollRow, setTargetScrollRow] = useState(0);
  const [animationId, setAnimationId] = useState<NodeJS.Timeout | null>(null);
  const [isFileNavigation, setIsFileNavigation] = useState(false);
  const [currentFileHeader, setCurrentFileHeader] = useState<string>('');
  const [currentHunkHeader, setCurrentHunkHeader] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('sidebyside');
  const [wrapMode, setWrapMode] = useState<WrapMode>('truncate');
  const commentStore = useMemo(() => commentStoreManager.getStore(worktreePath), [worktreePath]);
  const [tmuxService] = useState(() => new TmuxService());
  const [baseCommitHash, setBaseCommitHash] = useState<string>('');
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [showAllComments, setShowAllComments] = useState(true);
  const [showSessionWaitingDialog, setShowSessionWaitingDialog] = useState(false);
  const [sessionWaitingInfo, setSessionWaitingInfo] = useState<{sessionName: string}>({sessionName: ''});
  const [showUnsubmittedCommentsDialog, setShowUnsubmittedCommentsDialog] = useState(false);
  const [showFileTreeOverlay, setShowFileTreeOverlay] = useState(false);
  const [overlayHighlightedFile, setOverlayHighlightedFile] = useState<string>('');

  // Map of unified view global line index -> per-file line index (0-based)
  const unifiedPerFileIndex = useMemo(() => computeUnifiedPerFileIndices(lines as any), [lines]);

  // Map of side-by-side view line index -> per-file line index (0-based)
  const sideBySidePerFileIndex = useMemo(() => computeSideBySidePerFileIndices(sideBySideLines as any), [sideBySideLines]);

  // Derive list of files present in the diff (unique, in order encountered)
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

  // Helper to show the file tree overlay
  const showFileTree = (filePath: string) => {
    setOverlayHighlightedFile(filePath);
    setShowFileTreeOverlay(true);
  };

  useEffect(() => {
    (async () => {
      // Compute base hash first (so diff and prompts use the same value)
      let computedBaseHash = '';
      try {
        if (diffType === 'uncommitted') {
          const head = await runCommandAsync(['git', '-C', worktreePath, 'rev-parse', 'HEAD']);
          computedBaseHash = (head || '').trim();
        } else {
          let targetRef = 'HEAD~1';
          const base = findBaseBranch(worktreePath, BASE_BRANCH_CANDIDATES);
          if (base) {
            const mb = await runCommandAsync(['git', '-C', worktreePath, 'merge-base', 'HEAD', base]);
            if (mb) targetRef = mb.trim();
          }
          const hash = await runCommandAsync(['git', '-C', worktreePath, 'rev-parse', targetRef]);
          computedBaseHash = (hash || '').trim();
        }
      } catch {
        computedBaseHash = '';
      }

      setBaseCommitHash(computedBaseHash);
      commentStore.baseCommitHash = computedBaseHash || undefined;

      // Now load the diff using the computed base hash (for full diffs)
      const lns = await loadDiff(worktreePath, diffType, diffType === 'full' ? computedBaseHash : undefined);
      setLines(lns);
      setSideBySideLines(convertToSideBySide(lns));

      // Reset scroll position when loading new diff
      setScrollRow(0);
      setTargetScrollRow(0);
      setSelectedLine(0);
    })();
  }, [worktreePath, diffType]);

  const overlayAreaHeight = showFileTreeOverlay ? Math.max(6, Math.floor(terminalHeight / 2)) : 0;
  const showCommentSummary = showAllComments && commentStore.count > 0;
  const viewportRows = useMemo(() => calculateDiffViewportRows(terminalHeight, {
    hasFileHeader: !!currentFileHeader,
    hasHunkHeader: !!currentHunkHeader,
    showCommentSummary,
    overlayHeight: overlayAreaHeight,
  }), [terminalHeight, currentFileHeader, currentHunkHeader, showCommentSummary, overlayAreaHeight]);

  // Smooth scrolling animation
  useEffect(() => {
    if (scrollRow === targetScrollRow) return;

    // Clear any existing animation
    if (animationId) {
      clearTimeout(animationId);
    }

    const distance = Math.abs(targetScrollRow - scrollRow);
    
    // Skip animation for small movements
    if (distance <= 2) {
      setScrollRow(targetScrollRow);
      setAnimationId(null);
      // Clear file navigation flag for non-animated scrolls
      setIsFileNavigation(false);
      return;
    }

    // Animation parameters
    const baseDuration = 200;
    const maxDuration = 400;
    const duration = Math.min(maxDuration, baseDuration + distance * 2);
    const fps = 30;
    const frameTime = 1000 / fps;
    const totalFrames = Math.ceil(duration / frameTime);
    let currentFrame = 0;
    const startRow = scrollRow;
    const deltaRow = targetScrollRow - startRow;

    // Easing function (ease-out cubic)
    const easeOutCubic = (t: number): number => {
      return 1 - Math.pow(1 - t, 3);
    };

    let cancelled = false;
    
    const animate = () => {
      if (cancelled) return;
      
      currentFrame++;
      const progress = Math.min(currentFrame / totalFrames, 1);
      const easedProgress = easeOutCubic(progress);
      const newRow = Math.round(startRow + deltaRow * easedProgress);
      
      setScrollRow(newRow);

      if (progress < 1 && !cancelled) {
        const id = setTimeout(animate, frameTime);
        setAnimationId(id);
      } else {
        setAnimationId(null);
        // Clear file navigation flag when animation completes
        setIsFileNavigation(false);
      }
    };

    const initialId = setTimeout(animate, frameTime);
    setAnimationId(initialId);

    return () => {
      cancelled = true;
      if (initialId) clearTimeout(initialId);
    };
  }, [targetScrollRow]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationId) {
        clearTimeout(animationId);
      }
    };
  }, [animationId]);

  useInput((input, key) => {
    // Don't handle inputs when any dialog is open
    if (showCommentDialog || showSessionWaitingDialog || showUnsubmittedCommentsDialog) return;
    
    // Hide overlay on any key except Shift+Up/Down or Ctrl+Up/Down (overlay trigger)
    if (showFileTreeOverlay && !((key.shift || key.ctrl) && (key.upArrow || key.downArrow))) {
      setShowFileTreeOverlay(false);
    }

    if (key.escape || input === 'q') {
      // Check if there are unsaved comments
      if (commentStore.count > 0) {
        setShowUnsubmittedCommentsDialog(true);
        return;
      }
      return onClose();
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
      setSelectedLine(prev => Math.max(0, prev - Math.floor(viewportRows / 2)));
    }
    if (key.pageDown || input === 'f' || input === ' ') {
      setSelectedLine(prev => Math.min(maxLineIndex, prev + Math.floor(viewportRows / 2)));
    }
    if (input === 'g') {
      setSelectedLine(0);
    }
    if (input === 'G') {
      setSelectedLine(maxLineIndex);
    }
    
    // View mode toggle
    if (input === 'v') {
      setViewMode(current => current === 'unified' ? 'sidebyside' : 'unified');
    }
    
    // Wrap mode toggle
    if (input === 'w') {
      setWrapMode(current => current === 'truncate' ? 'wrap' : 'truncate');
    }
    
    // Comment functionality
    if (input === 'c') {
      if (viewMode === 'unified') {
        const currentLine = lines[selectedLine];
        // Allow comments on: added, context, removed lines, and file headers (but not hunk headers)
        if (currentLine && currentLine.fileName && 
            (currentLine.type !== 'header' || currentLine.headerType === 'file')) {
          setShowCommentDialog(true);
        }
      } else {
        const currentLine = sideBySideLines[selectedLine];
        if (currentLine && (currentLine.left?.fileName || currentLine.right?.fileName)) {
          // Allow comments except on hunk headers
          const isHunkHeader = (currentLine.left?.type === 'header' && currentLine.left.headerType === 'hunk') ||
                               (currentLine.right?.type === 'header' && currentLine.right.headerType === 'hunk');
          if (!isHunkHeader) {
            setShowCommentDialog(true);
          }
        }
      }
    }
    
    if (input === 'C') {
      setShowAllComments(!showAllComments);
    }
    
    if (input === 'd') {
      if (viewMode === 'unified') {
        const currentLine = lines[selectedLine];
        if (currentLine && currentLine.fileName) {
          const perFileIndex = unifiedPerFileIndex[selectedLine];
          if (perFileIndex !== undefined) {
            commentStore.removeComment(perFileIndex, currentLine.fileName);
          }
        }
      } else {
        const currentLine = sideBySideLines[selectedLine];
        const fileName = currentLine?.left?.fileName || currentLine?.right?.fileName;
        if (currentLine && fileName) {
          const perFileIndex = sideBySidePerFileIndex[selectedLine];
          if (perFileIndex !== undefined) {
            commentStore.removeComment(perFileIndex, fileName);
          }
        }
      }
    }
    
    if (input === 'S' || input === 's') {
      if (commentStore.count > 0) {
        sendCommentsToTmux().catch(error => {
          console.error('Failed to send comments:', error);
        });
      }
    }
    
    // Helper function to check if a line is a chunk header
    const isChunkHeader = (index: number): boolean => {
      if (viewMode === 'unified') {
        return lines[index]?.type === 'header' && lines[index]?.headerType === 'hunk';
      } else {
        const line = sideBySideLines[index];
        return line?.left?.type === 'header' && line.left.headerType === 'hunk';
      }
    };
    
    // Helper function to check if a line is a file header
    const isFileHeader = (index: number): boolean => {
      if (viewMode === 'unified') {
        return lines[index]?.type === 'header' && lines[index]?.headerType === 'file';
      } else {
        const line = sideBySideLines[index];
        return line?.left?.type === 'header' && line.left.headerType === 'file';
      }
    };
    
    // Helper function to find the first content line after a file header
    const findFirstContentLineAfterHeader = (headerIndex: number): number => {
      const currentLines = viewMode === 'unified' ? lines : sideBySideLines;
      const maxIndex = currentLines.length;
      
      // Look for the first non-header line after the file header
      for (let i = headerIndex + 1; i < maxIndex; i++) {
        if (viewMode === 'unified') {
          const line = lines[i];
          if (line.type !== 'header') {
            return i; // Found first content line (context, added, or removed)
          }
        } else {
          const line = sideBySideLines[i];
          if (line.left?.type !== 'header') {
            return i; // Found first content line
          }
        }
      }
      
      // If no content found, return the header index + 1 (fallback)
      return Math.min(headerIndex + 1, maxIndex - 1);
    };
    
    // Left arrow: jump to previous chunk (▼ header)
    if (key.leftArrow) {
      for (let i = selectedLine - 1; i >= 0; i--) {
        if (isChunkHeader(i)) {
          setSelectedLine(i);
          break;
        }
      }
    }
    
    // Right arrow: jump to next chunk (▼ header)
    if (key.rightArrow) {
      const maxIndex = viewMode === 'unified' ? lines.length : sideBySideLines.length;
      for (let i = selectedLine + 1; i < maxIndex; i++) {
        if (isChunkHeader(i)) {
          setSelectedLine(i);
          break;
        }
      }
    }
    
    if ((key.upArrow && (key.shift || key.ctrl)) || input === 'p') {
      // First, find the current file header
      let currentFileHeaderIndex = -1;
      for (let i = selectedLine; i >= 0; i--) {
        if (isFileHeader(i)) {
          currentFileHeaderIndex = i;
          break;
        }
      }
      
      // Now search for the previous file header (before the current one)
      const searchStart = currentFileHeaderIndex > 0 ? currentFileHeaderIndex - 1 : selectedLine - 1;
      for (let i = searchStart; i >= 0; i--) {
        if (isFileHeader(i)) {
          // Find the first content line after this file header
          const contentLineIndex = findFirstContentLineAfterHeader(i);
          setSelectedLine(contentLineIndex);
          // Highlight this file in overlay
          const fileName = viewMode === 'unified' ? (lines[i]?.fileName || '') : (sideBySideLines[i]?.left?.fileName || sideBySideLines[i]?.right?.fileName || '');
          if (fileName) showFileTree(fileName);
          
          const targetRow = Math.max(0, contentLineIndex);
          
          // Set flag to prevent auto-scroll from overriding our scroll position
          setIsFileNavigation(true);
          setTargetScrollRow(targetRow);
          break;
        }
      }
    }
    
    if ((key.downArrow && (key.shift || key.ctrl)) || input === 'n') {
      const maxIndex = viewMode === 'unified' ? lines.length : sideBySideLines.length;
      for (let i = selectedLine + 1; i < maxIndex; i++) {
        if (isFileHeader(i)) {
          // Find the first content line after this file header
          const contentLineIndex = findFirstContentLineAfterHeader(i);
          setSelectedLine(contentLineIndex);
          // Highlight this file in overlay
          const fileName = viewMode === 'unified' ? (lines[i]?.fileName || '') : (sideBySideLines[i]?.left?.fileName || sideBySideLines[i]?.right?.fileName || '');
          if (fileName) showFileTree(fileName);
          
          const targetRow = Math.max(0, contentLineIndex);
          
          // Set flag to prevent auto-scroll from overriding our scroll position
          setIsFileNavigation(true);
          setTargetScrollRow(targetRow);
          break;
        }
      }
    }
  });

  const maxWidth = viewMode === 'unified' ? terminalWidth - 2 : Math.floor((terminalWidth - 1) / 2) - 2;

  const textLines = useMemo(() => {
    const currentLines = viewMode === 'unified' ? lines : sideBySideLines;
    return currentLines.map(line => {
      if (viewMode === 'unified') {
        return (line as DiffLine).text || ' ';
      } else {
        const sbsLine = line as SideBySideLine;
        const leftText = sbsLine.left?.text || '';
        const rightText = sbsLine.right?.text || '';
        const leftH = LineWrapper.calculateHeight(leftText, maxWidth);
        const rightH = LineWrapper.calculateHeight(rightText, maxWidth);
        return leftH >= rightH ? leftText : rightText;
      }
    });
  }, [lines, sideBySideLines, viewMode, maxWidth]);

  // Auto-scroll to keep selected line visible
  useEffect(() => {
    const newScrollRow = ViewportCalculator.calculateScrollToShowLine(
      textLines,
      selectedLine,
      targetScrollRow,
      viewportRows,
      maxWidth,
      wrapMode
    );
    
    // Don't override scroll position during file navigation (Shift+Up/Down)
    // File navigation sets a specific scroll position to make headers sticky
    if (newScrollRow !== targetScrollRow && !isFileNavigation) {
      const maxScrollRow = ViewportCalculator.getMaxScrollRow(textLines, viewportRows, maxWidth, wrapMode);
      setTargetScrollRow(Math.max(0, Math.min(maxScrollRow, newScrollRow)));
    }
  }, [selectedLine, textLines, viewportRows, maxWidth, targetScrollRow, isFileNavigation, wrapMode]);

  

  const getLastTwoCommentLines = (comments: any[]): string[] => {
    const lines: string[] = [];
    
    // Get the last comment's text and file info
    if (comments.length > 0) {
      const lastComment = comments[comments.length - 1];
      if (lastComment.lineIndex !== undefined) {
        lines.push(`  Line ${lastComment.lineIndex + 1}: ${lastComment.commentText}`);
      } else if (lastComment.isRemoved && lastComment.originalLineIndex !== undefined) {
        lines.push(`  Removed line ${lastComment.originalLineIndex}: ${lastComment.commentText}`);
      }
      lines.push(`File: ${lastComment.fileName}`);
    }
    
    // If we have multiple comments, also include the second-to-last one
    if (comments.length > 1) {
      const secondLastComment = comments[comments.length - 2];
      if (secondLastComment.lineIndex !== undefined) {
        lines.push(`  Line ${secondLastComment.lineIndex + 1}: ${secondLastComment.commentText}`);
      } else if (secondLastComment.isRemoved && secondLastComment.originalLineIndex !== undefined) {
        lines.push(`  Removed line ${secondLastComment.originalLineIndex}: ${secondLastComment.commentText}`);
      }
    }
    
    return lines.filter(line => line.trim().length > 0);
  };

  const verifyCommentsReceived = async (sessionName: string, comments: any[]): Promise<boolean> => {
    // Wait a brief moment for tmux to process the input
    // This is synchronous in our case since runCommand is blocking
    
    // Capture the current pane content
    const paneContent = await tmuxService.capturePane(sessionName);
    
    if (!paneContent || paneContent.trim().length === 0) {
      return false; // No content captured
    }
    
    // Check if at least the last 2 lines we sent are visible
    // (checking last 2 ensures we're not just seeing partial input)
    const lastTwoLines = getLastTwoCommentLines(comments);
    
    if (lastTwoLines.length === 0) {
      return false; // No lines to verify
    }
    
    // At least one of the last two lines should be visible
    let foundLines = 0;
    for (const line of lastTwoLines) {
      if (paneContent.includes(line.trim())) {
        foundLines++;
      }
    }
    
    // Require at least one line to be found (being lenient for race conditions)
    return foundLines > 0;
  };

  const sendCommentsViaAltEnter = (sessionName: string, comments: any[], opts?: {workspaceFeature?: string; project?: string; baseCommitHash?: string}) => {
    // Format as lines and send with Alt+Enter (existing logic)
    const messageLines: string[] = [];
    messageLines.push("Please address the following code review comments:");
    messageLines.push("");
    if (opts?.workspaceFeature && opts?.project) {
      messageLines.push(`Context: In workspace '${opts.workspaceFeature}', target child directory: ./${opts.project}`);
      messageLines.push("");
    }
    
    const commentsByFile: {[key: string]: typeof comments} = {};
    comments.forEach(comment => {
      if (!commentsByFile[comment.fileName]) {
        commentsByFile[comment.fileName] = [];
      }
      commentsByFile[comment.fileName].push(comment);
    });

    Object.entries(commentsByFile).forEach(([fileName, fileComments]) => {
      const header = opts?.baseCommitHash ? `File: ${fileName}@${opts.baseCommitHash}` : `File: ${fileName}`;
      messageLines.push(header);
      fileComments.forEach(comment => {
        if (comment.lineIndex !== undefined) {
          messageLines.push(`  Line ${comment.lineIndex + 1}: ${comment.lineText}`);
        } else if (
          comment.lineText &&
          comment.lineText.trim().length > 0 &&
          !comment.isFileLevel
        ) {
          if (comment.isRemoved && comment.originalLineIndex !== undefined) {
            messageLines.push(`  Removed line ${comment.originalLineIndex}: ${comment.lineText}`);
          } else {
            messageLines.push(`  Removed line: ${comment.lineText}`);
          }
        }
        messageLines.push(`  Comment: ${comment.commentText}`);
      });
      messageLines.push("");
    });
    
    tmuxService.sendMultilineText(sessionName, messageLines, { endWithAltEnter: true });
  };

  const sendCommentsToTmux = async () => {
    const comments = commentStore.getAllComments();
    if (comments.length === 0) {
      // No comments to send, just return
      return;
    }

    try {
      // Extract project and feature correctly from worktree path
      // Path format: /base/path/project-branches/feature
      const pathParts = worktreePath.split('/');
      const feature = pathParts[pathParts.length - 1];
      const projectWithBranches = pathParts[pathParts.length - 2];
      const project = projectWithBranches.replace(/-branches$/, '');
      
      // Determine target session name
      // If this diff is for a workspace child, route comments to the top-level workspace session
      const sessionName = workspaceFeature
        ? tmuxService.sessionName('workspace', workspaceFeature)
        : tmuxService.sessionName(project, feature);
      
      // Check if session exists
      const sessions = await tmuxService.listSessions();
      const sessionExists = sessions.includes(sessionName);
      
      if (sessionExists) {
        // IMPORTANT: Refresh status right before checking
        const aiStatus = await tmuxService.getAIStatus(sessionName);
        const claudeStatus = aiStatus.status;
        
        if (claudeStatus === 'waiting') {
          // Claude is waiting for a response - can't accept new input
          setSessionWaitingInfo({sessionName});
          setShowSessionWaitingDialog(true);
          return; // Don't send comments
        }
        
        // For idle/working/thinking/not_running - we can proceed
        if (claudeStatus === 'not_running') {
          // Start Claude with the prompt pre-filled!
          const commentPrompt = formatCommentsAsPrompt(comments, {workspaceFeature, project, baseCommitHash: commentStore.baseCommitHash || baseCommitHash});
          tmuxService.sendText(sessionName, `claude ${JSON.stringify(commentPrompt)}`, { executeCommand: true });
        } else {
          // Claude is idle/working/active - can accept input via Alt+Enter
          sendCommentsViaAltEnter(sessionName, comments, {workspaceFeature, project, baseCommitHash: commentStore.baseCommitHash || baseCommitHash});
          
          // Wait a brief moment for tmux to process the input
          runCommand(['sleep', '0.5']);
          
          // VERIFY: Check if comments were actually received (handle race condition)
          const received = await verifyCommentsReceived(sessionName, comments);
          
          if (!received) {
            // Race condition detected - Claude probably transitioned to waiting
            // Keep comments and show dialog
            setSessionWaitingInfo({sessionName});
            setShowSessionWaitingDialog(true);
            return; // Don't clear comments or attach
          }
        }
      } else {
        // No session - create and start Claude with pre-filled prompt
        tmuxService.createSession(sessionName, worktreePath);
        const hasClaude = runCommand(['bash', '-lc', 'command -v claude || true']).trim();
        if (hasClaude) {
          // Launch Claude with the comments as the initial prompt!
          const commentPrompt = formatCommentsAsPrompt(comments, {workspaceFeature, project, baseCommitHash: commentStore.baseCommitHash || baseCommitHash});
          tmuxService.sendText(sessionName, `claude ${JSON.stringify(commentPrompt)}`, { executeCommand: true });
          
          // For new sessions, we can assume the prompt was received
          // since we're starting fresh with the prompt
        }
      }
      
      // Clear comments only after successful sending/verification
      commentStore.clear();
      
      // Close DiffView and attach to session
      onClose();
      if (onAttachToSession) {
        onAttachToSession(sessionName);
      }
      
    } catch (error) {
      // Log error but don't show dialog
      console.error('Failed to send comments to tmux:', error);
    }
  };

  const handleCommentSave = (commentText: string) => {
    if (viewMode === 'unified') {
      const currentLine = lines[selectedLine];
      if (currentLine && currentLine.fileName) {
        const perFileIndex = unifiedPerFileIndex[selectedLine];
        if (perFileIndex !== undefined) {
          // Original logic for lines with valid line numbers
          commentStore.addComment(perFileIndex, currentLine.fileName, currentLine.text, commentText, false);
        } else {
          // New logic for removed lines and file headers
          const isFileLevel = currentLine.type === 'header' && currentLine.headerType === 'file';
          const lineText = isFileLevel ? (currentLine.fileName || '') : currentLine.text;
          if (currentLine.type === 'removed') {
            commentStore.addComment(undefined, currentLine.fileName, lineText, commentText, false, { originalLineIndex: currentLine.oldLineIndex, isRemoved: true });
          } else {
            commentStore.addComment(undefined, currentLine.fileName, lineText, commentText, isFileLevel);
          }
        }
      }
    } else {
      const currentLine = sideBySideLines[selectedLine];
      const fileName = currentLine?.right?.fileName || currentLine?.left?.fileName;
      const lineText = currentLine?.right?.text || currentLine?.left?.text;
      
      if (currentLine && fileName && lineText) {
        const perFileIndex = sideBySidePerFileIndex[selectedLine];
        if (perFileIndex !== undefined) {
          // Original logic for lines with valid line numbers
          commentStore.addComment(perFileIndex, fileName, lineText, commentText, false);
        } else {
          // New logic for removed lines and file headers
          let textForComment = '';
          const isFileLevel = currentLine?.left?.type === 'header' && currentLine.left.headerType === 'file';
          if (isFileLevel) {
            // File header - use filename as line text
            textForComment = fileName || '';
          } else {
            // Removed lines - use the line text
            textForComment = currentLine?.left?.text || lineText;
          }
          if (currentLine?.left?.type === 'removed') {
            commentStore.addComment(undefined, fileName, textForComment, commentText, false, { originalLineIndex: currentLine.left.oldLineIndex, isRemoved: true });
          } else {
            commentStore.addComment(undefined, fileName, textForComment, commentText, isFileLevel);
          }
        }
      }
    }
    setShowCommentDialog(false);
  };

  const handleCommentCancel = () => {
    setShowCommentDialog(false);
  };

  const handleSessionWaitingGoToSession = () => {
    setShowSessionWaitingDialog(false);
    // Close DiffView and attach to session
    onClose();
    if (onAttachToSession) {
      onAttachToSession(sessionWaitingInfo.sessionName);
    }
  };

  const handleSessionWaitingCancel = () => {
    setShowSessionWaitingDialog(false);
  };

  const handleUnsubmittedCommentsSubmit = () => {
    setShowUnsubmittedCommentsDialog(false);
    sendCommentsToTmux().catch(error => {
      console.error('Failed to send comments:', error);
    });
  };

  const handleUnsubmittedCommentsExitWithoutSubmitting = () => {
    setShowUnsubmittedCommentsDialog(false);
    onClose();
  };

  const handleUnsubmittedCommentsCancel = () => {
    setShowUnsubmittedCommentsDialog(false);
  };


  const viewport = useMemo(() =>
    ViewportCalculator.calculate(textLines, selectedLine, scrollRow, viewportRows, maxWidth, wrapMode),
  [textLines, selectedLine, scrollRow, viewportRows, maxWidth, wrapMode]);
  
  useEffect(() => {
    const currentLines = viewMode === 'unified' ? lines : sideBySideLines;
    if (currentLines.length === 0) {
      setCurrentFileHeader('');
      setCurrentHunkHeader('');
      return;
    }

    let fileHeader = '';
    let hunkHeader = '';
    
    // Find the most recent headers before the viewport
    for (let i = viewport.firstVisibleLine - 1; i >= 0; i--) {
      if (viewMode === 'unified') {
        const line = lines[i];
        if (line.type === 'header' && line.headerType === 'file') {
          fileHeader = line.text;
          break;
        }
        if (!hunkHeader && line.type === 'header' && line.headerType === 'hunk') {
          hunkHeader = line.text;
        }
      } else {
        const line = sideBySideLines[i];
        if (line.left?.type === 'header' && line.left.headerType === 'file') {
          fileHeader = line.left.text;
          break;
        }
        if (!hunkHeader && line.left?.type === 'header' && line.left.headerType === 'hunk') {
          hunkHeader = line.left.text;
        }
      }
    }

    setCurrentFileHeader(fileHeader);
    setCurrentHunkHeader(hunkHeader);
  }, [viewport, lines, sideBySideLines, viewMode]);

  // Get visible lines using our viewport calculator
  const visibleLines = useMemo(() => {
    const currentLines = viewMode === 'unified' ? lines : sideBySideLines;
    return viewport.visibleLines.map(lineIndex => currentLines[lineIndex]).filter(Boolean);
  }, [viewport, lines, sideBySideLines, viewMode]);

  const languageCache = useMemo(() => {
    const cache = new Map<string | undefined, string>();
    return (fileName: string | undefined) => {
      if (!cache.has(fileName)) cache.set(fileName, getLanguageFromFileName(fileName));
      return cache.get(fileName)!;
    };
  }, []);

  // Create unsubmitted comments dialog if needed - render it instead of the main view when active
  if (showUnsubmittedCommentsDialog) {
    return (
      <Box flexDirection="column" height={terminalHeight} justifyContent="center" alignItems="center">
        <UnsubmittedCommentsDialog
          commentCount={commentStore.count}
          onSubmit={handleUnsubmittedCommentsSubmit}
          onExitWithoutSubmitting={handleUnsubmittedCommentsExitWithoutSubmitting}
          onCancel={handleUnsubmittedCommentsCancel}
        />
      </Box>
    );
  }

  // Create session waiting dialog if needed - render it instead of the main view when active
  if (showSessionWaitingDialog) {
    return (
      <Box flexDirection="column" height={terminalHeight} justifyContent="center" alignItems="center">
        <SessionWaitingDialog
          sessionName={sessionWaitingInfo.sessionName}
          onGoToSession={handleSessionWaitingGoToSession}
          onCancel={handleSessionWaitingCancel}
        />
      </Box>
    );
  }

  // Create comment dialog if needed - render it instead of the main view when active
  if (showCommentDialog) {
    return (
      <Box flexDirection="column" height={terminalHeight} justifyContent="center" alignItems="center">
        <CommentInputDialog
          fileName={viewMode === 'unified' ? 
            (lines[selectedLine]?.fileName || '') : 
            (sideBySideLines[selectedLine]?.right?.fileName || sideBySideLines[selectedLine]?.left?.fileName || '')}
          lineText={viewMode === 'unified' ? 
            (lines[selectedLine]?.text || '') : 
            // Prefer the current version (right) text when available
            (sideBySideLines[selectedLine]?.right?.text || sideBySideLines[selectedLine]?.left?.text || '')}
          isRemoved={(() => {
            if (viewMode === 'unified') {
              return lines[selectedLine]?.type === 'removed';
            } else {
              const s = sideBySideLines[selectedLine];
              return s?.left?.type === 'removed';
            }
          })()}
          initialComment={(() => {
            if (viewMode === 'unified') {
              const file = lines[selectedLine]?.fileName || '';
              const perFileIndex = unifiedPerFileIndex[selectedLine];
              return file && perFileIndex !== undefined ? (commentStore.getComment(perFileIndex, file)?.commentText || '') : '';
            } else {
              const fileName = sideBySideLines[selectedLine]?.right?.fileName || sideBySideLines[selectedLine]?.left?.fileName;
              const perFileIndex = sideBySidePerFileIndex[selectedLine];
              return fileName && perFileIndex !== undefined ? (commentStore.getComment(perFileIndex, fileName)?.commentText || '') : '';
            }
          })()}
          onSave={handleCommentSave}
          onCancel={handleCommentCancel}
        />
      </Box>
    );
  }

  // No early return: overlay is drawn on-screen while keeping diff visible

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold wrap="truncate">{title}</Text>
      {/* Sticky headers - only render when content exists */}
      {currentFileHeader && (
        <Text
          color="white"
          bold
          backgroundColor="gray"
          wrap="truncate"
        >
          {fitDisplay(` ${currentFileHeader}`, terminalWidth)}
        </Text>
      )}
      {currentHunkHeader && (
        <Text
          dimColor
          wrap="truncate"
        >
          {fitDisplay(currentHunkHeader, terminalWidth)}
        </Text>
      )}
      <Box flexDirection="column" height={viewportRows}>
        {visibleLines.flatMap((line, visibleLineIndex) => {
          const actualLineIndex = viewport.visibleLines[visibleLineIndex];
          const isCurrentLine = actualLineIndex === selectedLine;
          const rowBackground = isCurrentLine ? 'blue' : undefined;
          const isWrap = wrapMode === 'wrap';

          if (viewMode === 'unified') {
            const unifiedLine = line as DiffLine;
            const perFileIndex = unifiedPerFileIndex[actualLineIndex];
            const hasComment = !!unifiedLine.fileName && perFileIndex !== undefined && commentStore.hasComment(perFileIndex, unifiedLine.fileName);
            const gutterSymbol = unifiedLine.type === 'added' ? '+ ' : unifiedLine.type === 'removed' ? '- ' : '  ';
            const gutterColor = unifiedLine.type === 'added' || unifiedLine.type === 'removed' ? 'white' : 'gray';
            const bodyPrefix = unifiedLine.type === 'header' ? '' : (hasComment ? '  [C] ' : '  ');
            const bodyWidth = Math.max(1, terminalWidth - 4);
            const isFileHeader = unifiedLine.type === 'header' && unifiedLine.headerType === 'file';
            const isHunkHeader = unifiedLine.type === 'header' && unifiedLine.headerType === 'hunk';
            const bodyColor = isFileHeader ? 'white' : undefined;
            const useSyntax = (unifiedLine.type === 'added' || unifiedLine.type === 'removed') && !isCurrentLine;
            const lineTint = useSyntax ? (unifiedLine.type === 'added' ? 'green' : 'red') : undefined;
            const lineBackground = isFileHeader ? (rowBackground ?? 'gray') : (rowBackground ?? lineTint);
            const rawBody = `${bodyPrefix}${unifiedLine.text || ' '}`;

            if (isWrap) {
              const segments = LineWrapper.wrapLine(rawBody, bodyWidth);
              return segments.map((seg, segIdx) => (
                <Box key={`line-${actualLineIndex}-${segIdx}`} flexDirection="row" height={1} flexShrink={0}>
                  <Text color={gutterColor} backgroundColor={lineBackground} bold={isCurrentLine}>
                    {segIdx === 0 ? gutterSymbol : '  '}
                  </Text>
                  {useSyntax ? (
                    <SyntaxHighlight code={padEndDisplay(seg, bodyWidth)} language={languageCache(unifiedLine.fileName)} />
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
                  <SyntaxHighlight code={bodyText} language={languageCache(unifiedLine.fileName)} />
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
          }

          const sideBySideLine = line as SideBySideLine;
          const paneWidth = Math.max(1, Math.floor((terminalWidth - 2) / 2));
          const sbsFileForComment = sideBySideLine.right?.fileName || sideBySideLine.left?.fileName || '';
          const sbsIndexForComment = sideBySidePerFileIndex[actualLineIndex];
          const hasComment = !!sbsFileForComment && sbsIndexForComment !== undefined && commentStore.hasComment(sbsIndexForComment, sbsFileForComment);

          const formatPaneSegments = (
            pane: SideBySideLine['left'] | SideBySideLine['right'],
            prefix: string
          ): {segments: string[]; color?: string; dimColor?: boolean; bold?: boolean; useSyntax?: boolean; language?: string; backgroundColor?: string} => {
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
            return {segments: paddedSegs, useSyntax: !isCurrentLine, language: languageCache(pane.fileName), bold: isCurrentLine};
          };

          const isHeaderLine = sideBySideLine.left?.type === 'header' || sideBySideLine.right?.type === 'header';
          const leftPane = formatPaneSegments(sideBySideLine.left, isHeaderLine ? ' ' : (hasComment ? '  [C] ' : '  '));
          const rightPane = formatPaneSegments(sideBySideLine.right, isHeaderLine ? ' ' : '  ');
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
      </Box>
      
      {showCommentSummary && (
        <Text color="blue" wrap="truncate">
          {truncateDisplay(`Comments (${commentStore.count}): ${commentStore.getAllComments().map(comment => `${comment.fileName}:${comment.lineIndex ?? '-'} ${comment.commentText}`).join(' | ')}`, terminalWidth)}
        </Text>
      )}
      
      {!showFileTreeOverlay && (
        <AnnotatedText
          color="magenta"
          wrap="truncate"
          text={truncateDisplay(`Shift+↑/↓ or [p]/[n] prev/next file  [v]iew (${viewMode})  [w]rap (${wrapMode})  [c]omment  [C] show all  [d]elete  [S]end to agent  [q] close`, terminalWidth)}
        />
      )}
      
      {/* Bottom-left overlay while keeping diff visible */}
      {showFileTreeOverlay && (
        <Box flexDirection="row" marginTop={0}>
          <FileTreeOverlay
            files={diffFiles}
            highlightedFile={overlayHighlightedFile}
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
