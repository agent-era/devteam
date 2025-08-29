import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;
import {runCommandAsync} from '../../utils.js';
import {findBaseBranch} from '../../utils.js';
import {useTerminalDimensions} from '../../hooks/useTerminalDimensions.js';
import {BASE_BRANCH_CANDIDATES} from '../../constants.js';
import {CommentStore} from '../../models.js';
import {commentStoreManager} from '../../services/CommentStoreManager.js';
import {TmuxService} from '../../services/TmuxService.js';
import {runCommand} from '../../utils.js';
import CommentInputDialog from '../dialogs/CommentInputDialog.js';
import SessionWaitingDialog from '../dialogs/SessionWaitingDialog.js';
import UnsubmittedCommentsDialog from '../dialogs/UnsubmittedCommentsDialog.js';
import {truncateDisplay, padEndDisplay} from '../../shared/utils/formatting.js';
import {LineWrapper} from '../../shared/utils/lineWrapper.js';
import {ViewportCalculator} from '../../shared/utils/viewport.js';

type DiffLine = {type: 'added'|'removed'|'context'|'header'; text: string; fileName?: string};

type SideBySideLine = {
  left: {type: 'removed'|'context'|'header'|'empty'; text: string; fileName?: string} | null;
  right: {type: 'added'|'context'|'header'|'empty'; text: string; fileName?: string} | null;
  lineIndex: number; // Original line index for comments and navigation
};

async function loadDiff(worktreePath: string, diffType: 'full' | 'uncommitted' = 'full'): Promise<DiffLine[]> {
  const lines: DiffLine[] = [];
  let diff: string | null = null;
  
  if (diffType === 'uncommitted') {
    // Show only uncommitted changes (working directory vs HEAD)
    diff = await runCommandAsync(['git', '-C', worktreePath, 'diff', '--no-color', '--no-ext-diff', 'HEAD']);
  } else {
    // Show full diff against base branch (default behavior)
    let target = 'HEAD~1';
    const base = findBaseBranch(worktreePath, BASE_BRANCH_CANDIDATES);
    if (base) {
      const mb = await runCommandAsync(['git', '-C', worktreePath, 'merge-base', 'HEAD', base]);
      if (mb) target = mb.trim();
    }
    diff = await runCommandAsync(['git', '-C', worktreePath, 'diff', '--no-color', '--no-ext-diff', target]);
  }
  
  if (!diff) return lines;
  const raw = diff.split('\n');
  let currentFileName = '';
  for (const line of raw) {
    if (line.startsWith('diff --git')) {
      const parts = line.split(' ');
      const fp = parts[3]?.slice(2) || parts[2]?.slice(2) || '';
      currentFileName = fp;
      lines.push({type: 'header', text: `📁 ${fp}`, fileName: fp});
    } else if (line.startsWith('@@')) {
      const ctx = line.replace(/^@@.*@@ ?/, '');
      if (ctx) lines.push({type: 'header', text: `  ▼ ${ctx}`, fileName: currentFileName});
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({type: 'added', text: line.slice(1), fileName: currentFileName});
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lines.push({type: 'removed', text: line.slice(1), fileName: currentFileName});
    } else if (line.startsWith(' ')) {
      lines.push({type: 'context', text: line.slice(1), fileName: currentFileName});
    } else if (line === '') {
      lines.push({type: 'context', text: ' ', fileName: currentFileName}); // Empty line gets a space so cursor is visible
    }
  }
  // Append untracked files
  const untracked = await runCommandAsync(['git', '-C', worktreePath, 'ls-files', '--others', '--exclude-standard']);
  if (untracked) {
    for (const fp of untracked.split('\n').filter(Boolean)) {
      lines.push({type: 'header', text: `📁 ${fp} (new file)`, fileName: fp});
      try {
        const cat = await runCommandAsync(['bash', '-lc', `cd ${JSON.stringify(worktreePath)} && sed -n '1,200p' ${JSON.stringify(fp)}`]);
        for (const l of (cat || '').split('\n').filter(Boolean)) lines.push({type: 'added', text: l, fileName: fp});
      } catch {}
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
        left: {type: 'header', text: line.text, fileName: line.fileName},
        right: {type: 'header', text: line.text, fileName: line.fileName},
        lineIndex: lineIndex++
      });
      i++;
    } else if (line.type === 'context') {
      // Context lines appear on both sides
      sideBySideLines.push({
        left: {type: 'context', text: line.text, fileName: line.fileName},
        right: {type: 'context', text: line.text, fileName: line.fileName},
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
          left: removedLine ? {type: 'removed', text: removedLine.text, fileName: removedLine.fileName} : {type: 'empty', text: '', fileName: line.fileName},
          right: addedLine ? {type: 'added', text: addedLine.text, fileName: addedLine.fileName} : {type: 'empty', text: '', fileName: line.fileName},
          lineIndex: lineIndex++
        });
      }
    } else if (line.type === 'added') {
      // Added lines without preceding removed lines
      sideBySideLines.push({
        left: {type: 'empty', text: '', fileName: line.fileName},
        right: {type: 'added', text: line.text, fileName: line.fileName},
        lineIndex: lineIndex++
      });
      i++;
    } else {
      i++;
    }
  }

  return sideBySideLines;
}


type Props = {worktreePath: string; title?: string; onClose: () => void; diffType?: 'full' | 'uncommitted'; onAttachToSession?: (sessionName: string) => void};

type ViewMode = 'unified' | 'sidebyside';
type WrapMode = 'truncate' | 'wrap';

export default function DiffView({worktreePath, title = 'Diff Viewer', onClose, diffType = 'full', onAttachToSession}: Props) {
  const {rows: terminalHeight, columns: terminalWidth} = useTerminalDimensions();
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [sideBySideLines, setSideBySideLines] = useState<SideBySideLine[]>([]);
  const [selectedLine, setSelectedLine] = useState(0);
  const [scrollRow, setScrollRow] = useState(0);
  const [targetScrollRow, setTargetScrollRow] = useState(0);
  const [animationId, setAnimationId] = useState<NodeJS.Timeout | null>(null);
  const [currentFileHeader, setCurrentFileHeader] = useState<string>('');
  const [currentHunkHeader, setCurrentHunkHeader] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('unified');
  const [wrapMode, setWrapMode] = useState<WrapMode>('truncate');
  const commentStore = useMemo(() => commentStoreManager.getStore(worktreePath), [worktreePath]);
  const [tmuxService] = useState(() => new TmuxService());
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [showAllComments, setShowAllComments] = useState(true);
  const [showSessionWaitingDialog, setShowSessionWaitingDialog] = useState(false);
  const [sessionWaitingInfo, setSessionWaitingInfo] = useState<{sessionName: string}>({sessionName: ''});
  const [showUnsubmittedCommentsDialog, setShowUnsubmittedCommentsDialog] = useState(false);

  useEffect(() => {
    (async () => {
      const lns = await loadDiff(worktreePath, diffType);
      setLines(lns);
      setSideBySideLines(convertToSideBySide(lns));
      // Reset scroll position when loading new diff
      setScrollRow(0);
      setTargetScrollRow(0);
      setSelectedLine(0);
    })();
  }, [worktreePath, diffType]);

  // Calculate dynamic sticky header count (0, 1, or 2 headers displayed)
  const stickyHeaderCount = useMemo(() => {
    let count = 0;
    if (currentFileHeader) count++;
    if (currentHunkHeader) count++;
    return count;
  }, [currentFileHeader, currentHunkHeader]);

  // Calculate page size dynamically - reserve space for title, help, and actual sticky headers
  const pageSize = Math.max(1, terminalHeight - 2 - stickyHeaderCount - 1); // -1 title, -N sticky headers, -1 help

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
    
    if (key.upArrow || input === 'k') {
      setSelectedLine(prev => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === 'j') {
      setSelectedLine(prev => Math.min(maxLineIndex, prev + 1));
    }
    if (key.pageUp || input === 'b') {
      setSelectedLine(prev => Math.max(0, prev - pageSize));
    }
    if (key.pageDown || input === 'f' || input === ' ') {
      setSelectedLine(prev => Math.min(maxLineIndex, prev + pageSize));
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
        if (currentLine && currentLine.fileName && currentLine.type !== 'header') {
          setShowCommentDialog(true);
        }
      } else {
        const currentLine = sideBySideLines[selectedLine];
        if (currentLine && (currentLine.left?.fileName || currentLine.right?.fileName) && 
            currentLine.left?.type !== 'header') {
          setShowCommentDialog(true);
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
          commentStore.removeComment(selectedLine, currentLine.fileName);
        }
      } else {
        const currentLine = sideBySideLines[selectedLine];
        const fileName = currentLine.left?.fileName || currentLine.right?.fileName;
        if (currentLine && fileName) {
          commentStore.removeComment(currentLine.lineIndex, fileName);
        }
      }
    }
    
    if (input === 'S') {
      if (commentStore.count > 0) {
        sendCommentsToTmux().catch(error => {
          console.error('Failed to send comments:', error);
        });
      }
    }
    
    // Helper function to check if a line is a chunk header
    const isChunkHeader = (index: number): boolean => {
      if (viewMode === 'unified') {
        return lines[index]?.type === 'header' && lines[index]?.text.includes('▼');
      } else {
        const line = sideBySideLines[index];
        return line?.left?.type === 'header' && line.left.text.includes('▼');
      }
    };
    
    // Helper function to check if a line is a file header
    const isFileHeader = (index: number): boolean => {
      if (viewMode === 'unified') {
        return lines[index]?.type === 'header' && lines[index]?.text.startsWith('📁');
      } else {
        const line = sideBySideLines[index];
        return line?.left?.type === 'header' && line.left.text.startsWith('📁');
      }
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
    
    // Previous file: Shift+Left
    if (key.leftArrow && key.shift) {
      for (let i = selectedLine - 1; i >= 0; i--) {
        if (isFileHeader(i)) {
          setSelectedLine(i);
          break;
        }
      }
    }
    
    // Next file: Shift+Right
    if (key.rightArrow && key.shift) {
      const maxIndex = viewMode === 'unified' ? lines.length : sideBySideLines.length;
      for (let i = selectedLine + 1; i < maxIndex; i++) {
        if (isFileHeader(i)) {
          setSelectedLine(i);
          break;
        }
      }
    }
  });

  // Auto-scroll to keep selected line visible
  useEffect(() => {
    const currentLines = viewMode === 'unified' ? lines : sideBySideLines;
    const maxWidth = viewMode === 'unified' ? terminalWidth - 2 : Math.floor((terminalWidth - 1) / 2) - 2;
    
    // Convert diff lines to simple text for viewport calculation
    const textLines = currentLines.map(line => {
      if (viewMode === 'unified') {
        return (line as DiffLine).text || ' ';
      } else {
        const sbsLine = line as SideBySideLine;
        // For side-by-side, use the longer of left/right text for height calculation
        const leftText = sbsLine.left?.text || '';
        const rightText = sbsLine.right?.text || '';
        return leftText.length > rightText.length ? leftText : rightText;
      }
    });
    
    const newScrollRow = ViewportCalculator.calculateScrollToShowLine(
      textLines,
      selectedLine,
      targetScrollRow,
      pageSize,
      maxWidth,
      wrapMode
    );
    
    if (newScrollRow !== targetScrollRow) {
      const maxScrollRow = ViewportCalculator.getMaxScrollRow(textLines, pageSize, maxWidth, wrapMode);
      setTargetScrollRow(Math.max(0, Math.min(maxScrollRow, newScrollRow)));
    }
  }, [selectedLine, viewMode, wrapMode, terminalWidth, lines, sideBySideLines, pageSize]);

  const formatCommentsAsPrompt = (comments: any[]): string => {
    let prompt = "Please address the following code review comments:\\n\\n";
    
    const commentsByFile: {[key: string]: typeof comments} = {};
    comments.forEach(comment => {
      if (!commentsByFile[comment.fileName]) {
        commentsByFile[comment.fileName] = [];
      }
      commentsByFile[comment.fileName].push(comment);
    });

    Object.entries(commentsByFile).forEach(([fileName, fileComments]) => {
      prompt += `File: ${fileName}\\n`;
      fileComments.forEach(comment => {
        prompt += `  Line ${comment.lineIndex + 1}: ${comment.commentText}\\n`;
      });
      prompt += "\\n";
    });
    
    return prompt;
  };

  const getLastTwoCommentLines = (comments: any[]): string[] => {
    const lines: string[] = [];
    
    // Get the last comment's text and file info
    if (comments.length > 0) {
      const lastComment = comments[comments.length - 1];
      lines.push(`  Line ${lastComment.lineIndex + 1}: ${lastComment.commentText}`);
      lines.push(`File: ${lastComment.fileName}`);
    }
    
    // If we have multiple comments, also include the second-to-last one
    if (comments.length > 1) {
      const secondLastComment = comments[comments.length - 2];
      lines.push(`  Line ${secondLastComment.lineIndex + 1}: ${secondLastComment.commentText}`);
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

  const sendCommentsViaAltEnter = (sessionName: string, comments: any[]) => {
    // Format as lines and send with Alt+Enter (existing logic)
    const messageLines: string[] = [];
    messageLines.push("Please address the following code review comments:");
    messageLines.push("");
    
    const commentsByFile: {[key: string]: typeof comments} = {};
    comments.forEach(comment => {
      if (!commentsByFile[comment.fileName]) {
        commentsByFile[comment.fileName] = [];
      }
      commentsByFile[comment.fileName].push(comment);
    });

    Object.entries(commentsByFile).forEach(([fileName, fileComments]) => {
      messageLines.push(`File: ${fileName}`);
      fileComments.forEach(comment => {
        messageLines.push(`  Line ${comment.lineIndex + 1}: ${comment.commentText}`);
      });
      messageLines.push("");
    });
    
    messageLines.forEach((line) => {
      runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, line]);
      runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'Escape', 'Enter']);
    });
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
      
      // Construct proper session name: dev-project-feature
      const sessionName = tmuxService.sessionName(project, feature);
      
      // Check if session exists
      const sessions = await tmuxService.listSessions();
      const sessionExists = sessions.includes(sessionName);
      
      if (sessionExists) {
        // IMPORTANT: Refresh status right before checking
        const claudeStatus = await tmuxService.getClaudeStatus(sessionName);
        
        if (claudeStatus === 'waiting') {
          // Claude is waiting for a response - can't accept new input
          setSessionWaitingInfo({sessionName});
          setShowSessionWaitingDialog(true);
          return; // Don't send comments
        }
        
        // For idle/working/thinking/not_running - we can proceed
        if (claudeStatus === 'not_running') {
          // Start Claude with the prompt pre-filled!
          const commentPrompt = formatCommentsAsPrompt(comments);
          runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 
                     `claude ${JSON.stringify(commentPrompt)}`, 'C-m']);
        } else {
          // Claude is idle/working/active - can accept input via Alt+Enter
          sendCommentsViaAltEnter(sessionName, comments);
          
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
        runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', worktreePath]);
        const hasClaude = runCommand(['bash', '-lc', 'command -v claude || true']).trim();
        if (hasClaude) {
          // Launch Claude with the comments as the initial prompt!
          const commentPrompt = formatCommentsAsPrompt(comments);
          runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 
                     `claude ${JSON.stringify(commentPrompt)}`, 'C-m']);
          
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
        commentStore.addComment(selectedLine, currentLine.fileName, currentLine.text, commentText);
      }
    } else {
      const currentLine = sideBySideLines[selectedLine];
      const fileName = currentLine.left?.fileName || currentLine.right?.fileName;
      const lineText = currentLine.left?.text || currentLine.right?.text;
      if (currentLine && fileName && lineText) {
        commentStore.addComment(currentLine.lineIndex, fileName, lineText, commentText);
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


  // Update sticky headers - simplified using viewport info
  const viewport = useMemo(() => {
    const currentLines = viewMode === 'unified' ? lines : sideBySideLines;
    const maxWidth = viewMode === 'unified' ? terminalWidth - 2 : Math.floor((terminalWidth - 1) / 2) - 2;
    
    const textLines = currentLines.map(line => {
      if (viewMode === 'unified') {
        return (line as DiffLine).text || ' ';
      } else {
        const sbsLine = line as SideBySideLine;
        const leftText = sbsLine.left?.text || '';
        const rightText = sbsLine.right?.text || '';
        return leftText.length > rightText.length ? leftText : rightText;
      }
    });
    
    return ViewportCalculator.calculate(
      textLines,
      selectedLine,
      scrollRow,
      pageSize,
      maxWidth,
      wrapMode
    );
  }, [lines, sideBySideLines, selectedLine, scrollRow, pageSize, viewMode, wrapMode, terminalWidth]);
  
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
        if (line.type === 'header' && line.text.startsWith('📁')) {
          fileHeader = line.text;
          break;
        }
        if (!fileHeader && line.type === 'header' && line.text.includes('▼')) {
          hunkHeader = line.text;
        }
      } else {
        const line = sideBySideLines[i];
        if (line.left?.type === 'header' && line.left.text.startsWith('📁')) {
          fileHeader = line.left.text;
          break;
        }
        if (!fileHeader && line.left?.type === 'header' && line.left.text.includes('▼')) {
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

  // Create unsubmitted comments dialog if needed - render it instead of the main view when active
  if (showUnsubmittedCommentsDialog) {
    return h(
      Box,
      {flexDirection: 'column', height: terminalHeight, justifyContent: 'center', alignItems: 'center'},
      h(UnsubmittedCommentsDialog, {
        commentCount: commentStore.count,
        onSubmit: handleUnsubmittedCommentsSubmit,
        onExitWithoutSubmitting: handleUnsubmittedCommentsExitWithoutSubmitting,
        onCancel: handleUnsubmittedCommentsCancel
      })
    );
  }

  // Create session waiting dialog if needed - render it instead of the main view when active
  if (showSessionWaitingDialog) {
    return h(
      Box,
      {flexDirection: 'column', height: terminalHeight, justifyContent: 'center', alignItems: 'center'},
      h(SessionWaitingDialog, {
        sessionName: sessionWaitingInfo.sessionName,
        onGoToSession: handleSessionWaitingGoToSession,
        onCancel: handleSessionWaitingCancel
      })
    );
  }

  // Create comment dialog if needed - render it instead of the main view when active
  if (showCommentDialog) {
    return h(
      Box,
      {flexDirection: 'column', height: terminalHeight, justifyContent: 'center', alignItems: 'center'},
      h(CommentInputDialog, {
        fileName: viewMode === 'unified' ? 
          (lines[selectedLine]?.fileName || '') : 
          (sideBySideLines[selectedLine]?.left?.fileName || sideBySideLines[selectedLine]?.right?.fileName || ''),
        lineText: viewMode === 'unified' ? 
          (lines[selectedLine]?.text || '') : 
          (sideBySideLines[selectedLine]?.left?.text || sideBySideLines[selectedLine]?.right?.text || ''),
        initialComment: (() => {
          if (viewMode === 'unified') {
            return lines[selectedLine]?.fileName ? commentStore.getComment(selectedLine, lines[selectedLine].fileName)?.commentText || '' : '';
          } else {
            const fileName = sideBySideLines[selectedLine]?.left?.fileName || sideBySideLines[selectedLine]?.right?.fileName;
            return fileName ? commentStore.getComment(sideBySideLines[selectedLine].lineIndex, fileName)?.commentText || '' : '';
          }
        })(),
        onSave: handleCommentSave,
        onCancel: handleCommentCancel
      })
    );
  }

  return h(
    Box,
    {flexDirection: 'column'},
    h(Text, {bold: true}, title),
    // Sticky headers - only render when content exists
    ...(currentFileHeader ? [h(Text, {
      color: 'cyan',
      bold: true,
      backgroundColor: 'gray'
    }, currentFileHeader)] : []),
    ...(currentHunkHeader ? [h(Text, {
      color: 'cyan',
      bold: true,
      backgroundColor: 'gray'
    }, currentHunkHeader)] : []),
    ...(() => {
      const renderedElements: React.ReactNode[] = [];
      let visibleLineIndex = 0;
      
      for (const l of visibleLines) {
        const actualLineIndex = viewport.visibleLines[visibleLineIndex];
        const isCurrentLine = actualLineIndex === selectedLine;
        
        if (viewMode === 'unified') {
          const unifiedLine = l as DiffLine;
          const hasComment = unifiedLine.fileName && commentStore.hasComment(actualLineIndex, unifiedLine.fileName);
          const commentIndicator = hasComment ? '[C] ' : '';
          const fullText = commentIndicator + (unifiedLine.text || ' ');
          
          if (wrapMode === 'truncate') {
            // Original truncate logic
            const displayText = truncateDisplay(fullText, terminalWidth - 2);
            renderedElements.push(h(Text, {
              key: `line-${visibleLineIndex}`,
              color: unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : unifiedLine.type === 'header' ? 'cyan' : undefined,
              backgroundColor: isCurrentLine ? 'blue' : undefined,
              bold: isCurrentLine
            }, displayText));
          } else {
            // Wrap mode: split line into segments
            const maxWidth = terminalWidth - 2;
            const segments = LineWrapper.wrapLine(fullText, maxWidth);
            
            segments.forEach((segment, segIdx) => {
              renderedElements.push(h(Text, {
                key: `line-${visibleLineIndex}-seg-${segIdx}`,
                color: unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : unifiedLine.type === 'header' ? 'cyan' : undefined,
                backgroundColor: isCurrentLine ? 'blue' : undefined,
                bold: isCurrentLine
              }, segment));
            });
          }
        } else {
          // Side-by-side diff rendering
          const sideBySideLine = l as SideBySideLine;
          const paneWidth = Math.floor((terminalWidth - 1) / 2); // -1 for separator
          
          // Get comment info based on the original line index
          const hasComment = (sideBySideLine.left?.fileName || sideBySideLine.right?.fileName) && 
                            commentStore.hasComment(sideBySideLine.lineIndex, sideBySideLine.left?.fileName || sideBySideLine.right?.fileName || '');
          const commentIndicator = hasComment ? '[C] ' : '';
          
          // Prepare left and right content
          const leftFullText = sideBySideLine.left ? (commentIndicator + (sideBySideLine.left.text || ' ')) : '';
          const rightFullText = sideBySideLine.right ? (sideBySideLine.right.text || ' ') : '';
          
          const leftColor = sideBySideLine.left?.type === 'header' ? 'cyan' : undefined;
          const rightColor = sideBySideLine.right?.type === 'header' ? 'cyan' : undefined;
          const leftDimColor = !sideBySideLine.left || sideBySideLine.left.type === 'context' || sideBySideLine.left.type === 'empty';
          const rightDimColor = !sideBySideLine.right || sideBySideLine.right.type === 'context' || sideBySideLine.right.type === 'empty';
          
          if (wrapMode === 'truncate') {
            // Original truncate logic for side-by-side
            const leftText = leftFullText ? truncateDisplay(leftFullText, paneWidth - 2) : '';
            const rightText = rightFullText ? truncateDisplay(rightFullText, paneWidth - 2) : '';
            
            renderedElements.push(h(Box, {
              key: `line-${visibleLineIndex}`,
              flexDirection: 'row'
            }, 
              h(Text, {
                bold: isCurrentLine,
                color: leftColor,
                dimColor: leftDimColor,
                backgroundColor: isCurrentLine ? 'blue' : undefined
              }, padEndDisplay(' ' + leftText, paneWidth)),
              h(Text, {
                bold: isCurrentLine,
                backgroundColor: isCurrentLine ? 'blue' : undefined
              }, '│'),
              h(Text, {
                bold: isCurrentLine,
                color: rightColor,
                dimColor: rightDimColor,
                backgroundColor: isCurrentLine ? 'blue' : undefined
              }, padEndDisplay(' ' + rightText, paneWidth))
            ));
          } else {
            // Wrap mode: handle wrapped side-by-side content
            const maxPaneWidth = paneWidth - 2;
            const leftSegments = leftFullText ? LineWrapper.wrapLine(leftFullText, maxPaneWidth) : [''];
            const rightSegments = rightFullText ? LineWrapper.wrapLine(rightFullText, maxPaneWidth) : [''];
            const maxSegments = Math.max(leftSegments.length, rightSegments.length);
            
            for (let segIdx = 0; segIdx < maxSegments; segIdx++) {
              const leftSegment = leftSegments[segIdx] || '';
              const rightSegment = rightSegments[segIdx] || '';
              
              renderedElements.push(h(Box, {
                key: `line-${visibleLineIndex}-seg-${segIdx}`,
                flexDirection: 'row'
              },
                h(Text, {
                  bold: isCurrentLine,
                  color: leftColor,
                  dimColor: leftDimColor,
                  backgroundColor: isCurrentLine ? 'blue' : undefined
                }, padEndDisplay(' ' + leftSegment, paneWidth)),
                h(Text, {
                  bold: isCurrentLine,
                  backgroundColor: isCurrentLine ? 'blue' : undefined
                }, '│'),
                h(Text, {
                  bold: isCurrentLine,
                  color: rightColor,
                  dimColor: rightDimColor,
                  backgroundColor: isCurrentLine ? 'blue' : undefined
                }, padEndDisplay(' ' + rightSegment, paneWidth))
              ));
            }
          }
        }
        
        visibleLineIndex++;
      }
      
      return renderedElements;
    })(),
    showAllComments && commentStore.count > 0 ? h(
      Box,
      {flexDirection: 'column', borderStyle: 'single', borderColor: 'blue', padding: 1, marginTop: 1},
      h(Text, {bold: true, color: 'blue'}, `All Comments (${commentStore.count}):`),
      ...commentStore.getAllComments().map((comment, idx) => 
        h(Text, {key: idx, color: 'gray'}, `${comment.fileName}:${comment.lineIndex} - ${comment.commentText}`)
      )
    ) : null,
    h(Text, {color: 'gray'}, `j/k move  v toggle view (${viewMode})  w toggle wrap (${wrapMode})  c comment  C show all  d delete  S send to Claude  q close`)
  );
}

