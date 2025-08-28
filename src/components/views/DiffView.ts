import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;
import {runCommandAsync} from '../../utils.js';
import {findBaseBranch} from '../../utils.js';
import {BASE_BRANCH_CANDIDATES} from '../../constants.js';
import {CommentStore} from '../../models.js';
import {commentStoreManager} from '../../services/CommentStoreManager.js';
import {TmuxService} from '../../services/TmuxService.js';
import {runCommand} from '../../utils.js';
import CommentInputDialog from '../dialogs/CommentInputDialog.js';
import SessionWaitingDialog from '../dialogs/SessionWaitingDialog.js';
import UnsubmittedCommentsDialog from '../dialogs/UnsubmittedCommentsDialog.js';

type DiffLine = {type: 'added'|'removed'|'context'|'header'; text: string; fileName?: string};

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

type Props = {worktreePath: string; title?: string; onClose: () => void; diffType?: 'full' | 'uncommitted'; onAttachToSession?: (sessionName: string) => void};

export default function DiffView({worktreePath, title = 'Diff Viewer', onClose, diffType = 'full', onAttachToSession}: Props) {
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [pos, setPos] = useState(0);
  const [offset, setOffset] = useState(0);
  const [targetOffset, setTargetOffset] = useState(0);
  const [animationId, setAnimationId] = useState<NodeJS.Timeout | null>(null);
  const [terminalHeight, setTerminalHeight] = useState<number>(process.stdout.rows || 24);
  const [terminalWidth, setTerminalWidth] = useState<number>(process.stdout.columns || 80);
  const [currentFileHeader, setCurrentFileHeader] = useState<string>('');
  const [currentHunkHeader, setCurrentHunkHeader] = useState<string>('');
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
      // Reset scroll position when loading new diff
      setOffset(0);
      setTargetOffset(0);
      setPos(0);
    })();
    const onResize = () => {
      const newHeight = process.stdout.rows || 24;
      const newWidth = process.stdout.columns || 80;
      setTerminalHeight(newHeight);
      setTerminalWidth(newWidth);
    };
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off?.('resize', onResize as any); };
  }, [worktreePath, diffType]);

  // Calculate page size dynamically - reserve space for title, help, and sticky headers
  const pageSize = Math.max(1, terminalHeight - 4); // -1 title, -2 sticky headers, -1 help

  // Smooth scrolling animation
  useEffect(() => {
    if (offset === targetOffset) return;

    // Clear any existing animation
    if (animationId) {
      clearTimeout(animationId);
    }

    const distance = Math.abs(targetOffset - offset);
    
    // Skip animation only for very small movements (1-2 lines)
    if (distance <= 2) {
      setOffset(targetOffset);
      setAnimationId(null);
      return;
    }

    // Animation parameters - scale duration with distance for better feel
    const baseDuration = 200;
    const maxDuration = 400;
    const duration = Math.min(maxDuration, baseDuration + distance * 2);
    const fps = 30; // Reduced for better performance in terminals
    const frameTime = 1000 / fps;
    const totalFrames = Math.ceil(duration / frameTime);
    let currentFrame = 0;
    const startOffset = offset;
    const deltaOffset = targetOffset - startOffset;

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
      const newOffset = Math.round(startOffset + deltaOffset * easedProgress);
      
      setOffset(newOffset);

      if (progress < 1 && !cancelled) {
        const id = setTimeout(animate, frameTime);
        setAnimationId(id);
      } else {
        setAnimationId(null);
      }
    };

    const initialId = setTimeout(animate, frameTime);
    setAnimationId(initialId);

    // Cleanup function
    return () => {
      cancelled = true;
      if (initialId) clearTimeout(initialId);
    };
  }, [targetOffset, pageSize]); // Removed offset and animationId from deps to prevent infinite loops

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
    if (key.upArrow || input === 'k') setPos((p) => Math.max(0, p - 1));
    if (key.downArrow || input === 'j') setPos((p) => Math.min(lines.length - 1, p + 1));
    if (key.pageUp || input === 'b') setPos((p) => Math.max(0, p - pageSize));
    if (key.pageDown || input === 'f' || input === ' ') setPos((p) => Math.min(lines.length - 1, p + pageSize));
    if (input === 'g') setPos(0);
    if (input === 'G') setPos(Math.max(0, lines.length - 1));
    
    // Comment functionality
    if (input === 'c') {
      const currentLine = lines[pos];
      if (currentLine && currentLine.fileName && currentLine.type !== 'header') {
        setShowCommentDialog(true);
      }
    }
    
    if (input === 'C') {
      setShowAllComments(!showAllComments);
    }
    
    if (input === 'd') {
      const currentLine = lines[pos];
      if (currentLine && currentLine.fileName) {
        commentStore.removeComment(pos, currentLine.fileName);
      }
    }
    
    if (input === 'S') {
      if (commentStore.count > 0) {
        sendCommentsToTmux();
      }
    }
    
    // Left arrow: jump to previous chunk (▼ header)
    if (key.leftArrow) {
      for (let i = pos - 1; i >= 0; i--) {
        if (lines[i]?.type === 'header' && lines[i]?.text.includes('▼')) {
          setPos(i);
          setTargetOffset(i); // Position chunk at top of screen with smooth scrolling
          break;
        }
      }
    }
    
    // Right arrow: jump to next chunk (▼ header)
    if (key.rightArrow) {
      for (let i = pos + 1; i < lines.length; i++) {
        if (lines[i]?.type === 'header' && lines[i]?.text.includes('▼')) {
          setPos(i);
          setTargetOffset(i); // Position chunk at top of screen with smooth scrolling
          break;
        }
      }
    }
    
    // Previous file: Shift+Left
    if (key.leftArrow && key.shift) {
      for (let i = pos - 1; i >= 0; i--) {
        if (lines[i]?.type === 'header' && lines[i]?.text.startsWith('📁')) {
          setPos(i);
          setTargetOffset(i); // Position file at top of screen with smooth scrolling
          break;
        }
      }
    }
    
    // Next file: Shift+Right
    if (key.rightArrow && key.shift) {
      for (let i = pos + 1; i < lines.length; i++) {
        if (lines[i]?.type === 'header' && lines[i]?.text.startsWith('📁')) {
          setPos(i);
          setTargetOffset(i); // Position file at top of screen with smooth scrolling
          break;
        }
      }
    }
  });

  // ensure pos visible with smooth scrolling
  useEffect(() => {
    let newTargetOffset = targetOffset;
    
    if (pos < targetOffset) {
      newTargetOffset = pos;
    } else if (pos >= targetOffset + pageSize) {
      newTargetOffset = pos - pageSize + 1;
    }
    
    if (newTargetOffset !== targetOffset) {
      setTargetOffset(Math.max(0, Math.min(lines.length - pageSize, newTargetOffset)));
    }
  }, [pos, targetOffset, pageSize, lines.length]);

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

  const verifyCommentsReceived = (sessionName: string, comments: any[]): boolean => {
    // Wait a brief moment for tmux to process the input
    // This is synchronous in our case since runCommand is blocking
    
    // Capture the current pane content
    const paneContent = tmuxService.capturePane(sessionName);
    
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

  const sendCommentsToTmux = () => {
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
      const sessionExists = tmuxService.listSessions().includes(sessionName);
      
      if (sessionExists) {
        // IMPORTANT: Refresh status right before checking
        const claudeStatus = tmuxService.getClaudeStatus(sessionName);
        
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
          const received = verifyCommentsReceived(sessionName, comments);
          
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
    const currentLine = lines[pos];
    if (currentLine && currentLine.fileName) {
      commentStore.addComment(pos, currentLine.fileName, currentLine.text, commentText);
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
    sendCommentsToTmux();
  };

  const handleUnsubmittedCommentsExitWithoutSubmitting = () => {
    setShowUnsubmittedCommentsDialog(false);
    onClose();
  };

  const handleUnsubmittedCommentsCancel = () => {
    setShowUnsubmittedCommentsDialog(false);
  };

  // Truncate text to fit terminal width
  const truncateText = (text: string, maxWidth: number): string => {
    if (text.length <= maxWidth) return text;
    return text.substring(0, maxWidth - 3) + '...';
  };

  // Update sticky headers based on scroll offset
  useEffect(() => {
    if (lines.length === 0) return;

    let fileHeader = '';
    let hunkHeader = '';
    let fileHeaderIndex = -1;
    let hunkHeaderIndex = -1;

    // Search backwards from offset-1 to find headers that have scrolled off screen
    for (let i = offset - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line) continue;

      // Find hunk header first (only if we haven't found the file yet)
      if (hunkHeaderIndex === -1 && fileHeaderIndex === -1 && line.type === 'header' && line.text.includes('▼')) {
        hunkHeader = line.text;
        hunkHeaderIndex = i;
      }

      // Find file header
      if (fileHeaderIndex === -1 && line.type === 'header' && line.text.startsWith('📁')) {
        fileHeader = line.text;
        fileHeaderIndex = i;
        
        // Clear hunk if it belongs to a different file
        if (hunkHeaderIndex !== -1 && hunkHeaderIndex < fileHeaderIndex) {
          hunkHeader = '';
          hunkHeaderIndex = -1;
        }
        break; // Found file, we're done
      }
    }

    // Only show headers that have actually scrolled off screen
    const shouldShowFileHeader = fileHeaderIndex >= 0 && fileHeaderIndex < offset;
    const shouldShowHunkHeader = hunkHeaderIndex >= 0 && hunkHeaderIndex < offset;

    setCurrentFileHeader(shouldShowFileHeader ? fileHeader : '');
    setCurrentHunkHeader(shouldShowHunkHeader ? hunkHeader : '');
  }, [lines, offset]);

  const visible = useMemo(() => {
    return lines.slice(offset, offset + pageSize);
  }, [lines, offset, pageSize]);

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
        fileName: lines[pos]?.fileName || '',
        lineText: lines[pos]?.text || '',
        initialComment: lines[pos]?.fileName ? commentStore.getComment(pos, lines[pos].fileName)?.commentText || '' : '',
        onSave: handleCommentSave,
        onCancel: handleCommentCancel
      })
    );
  }

  return h(
    Box,
    {flexDirection: 'column'},
    h(Text, {bold: true}, title),
    // Sticky headers
    h(Text, {
      color: 'cyan',
      bold: true,
      backgroundColor: 'gray'
    }, currentFileHeader || ''),
    h(Text, {
      color: 'cyan',
      bold: true,
      backgroundColor: 'gray'
    }, currentHunkHeader || ''),
    ...visible.map((l, idx) => {
      const actualLineIndex = offset + idx;
      const isCurrentLine = actualLineIndex === pos;
      const hasComment = l.fileName && commentStore.hasComment(actualLineIndex, l.fileName);
      const commentIndicator = hasComment ? '[C] ' : '';
      const displayText = truncateText(commentIndicator + (l.text || ' '), terminalWidth - 2); // -2 for padding
      return h(Text, {
        key: idx,
        color: l.type === 'added' ? 'green' : l.type === 'removed' ? 'red' : l.type === 'header' ? 'cyan' : undefined,
        backgroundColor: isCurrentLine ? 'blue' : undefined,
        bold: isCurrentLine
      }, displayText);
    }),
    showAllComments && commentStore.count > 0 ? h(
      Box,
      {flexDirection: 'column', borderStyle: 'single', borderColor: 'blue', padding: 1, marginTop: 1},
      h(Text, {bold: true, color: 'blue'}, `All Comments (${commentStore.count}):`),
      ...commentStore.getAllComments().map((comment, idx) => 
        h(Text, {key: idx, color: 'gray'}, `${comment.fileName}:${comment.lineIndex} - ${comment.commentText}`)
      )
    ) : null,
    h(Text, {color: 'gray'}, 'j/k move  c comment  C show all  d delete  S send to Claude  q close')
  );
}

