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

type Props = {worktreePath: string; title?: string; onClose: () => void; diffType?: 'full' | 'uncommitted'};

export default function DiffView({worktreePath, title = 'Diff Viewer', onClose, diffType = 'full'}: Props) {
  const {isRawModeSupported} = useStdin();
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [pos, setPos] = useState(0);
  const [offset, setOffset] = useState(0);
  const [terminalHeight, setTerminalHeight] = useState<number>(process.stdout.rows || 24);
  const [terminalWidth, setTerminalWidth] = useState<number>(process.stdout.columns || 80);
  const commentStore = useMemo(() => commentStoreManager.getStore(worktreePath), [worktreePath]);
  const [tmuxService] = useState(() => new TmuxService());
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);

  useEffect(() => {
    (async () => {
      const lns = await loadDiff(worktreePath, diffType);
      setLines(lns);
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

  // Calculate page size dynamically - reserve space for debug, title, and help
  const pageSize = Math.max(1, terminalHeight - 3);

  useInput((input, key) => {
    if (!isRawModeSupported) return;
    
    // Don't handle inputs when comment dialog is open
    if (showCommentDialog) return;
    
    if (key.escape || input === 'q') return onClose();
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
          setOffset(i); // Position chunk at top of screen
          break;
        }
      }
    }
    
    // Right arrow: jump to next chunk (▼ header)
    if (key.rightArrow) {
      for (let i = pos + 1; i < lines.length; i++) {
        if (lines[i]?.type === 'header' && lines[i]?.text.includes('▼')) {
          setPos(i);
          setOffset(i); // Position chunk at top of screen
          break;
        }
      }
    }
    
    // Previous file: Shift+Left
    if (key.leftArrow && key.shift) {
      for (let i = pos - 1; i >= 0; i--) {
        if (lines[i]?.type === 'header' && lines[i]?.text.startsWith('📁')) {
          setPos(i);
          setOffset(i); // Position file at top of screen
          break;
        }
      }
    }
    
    // Next file: Shift+Right
    if (key.rightArrow && key.shift) {
      for (let i = pos + 1; i < lines.length; i++) {
        if (lines[i]?.type === 'header' && lines[i]?.text.startsWith('📁')) {
          setPos(i);
          setOffset(i); // Position file at top of screen
          break;
        }
      }
    }
  });

  // ensure pos visible
  useEffect(() => {
    if (pos < offset) setOffset(pos);
    else if (pos >= offset + pageSize) setOffset(pos - pageSize + 1);
  }, [pos, offset, pageSize]);

  const waitForClaudeReady = async (sessionName: string, maxWait: number = 10000): Promise<boolean> => {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      const status = tmuxService.getClaudeStatus(sessionName);
      if (status === 'idle' || status === 'waiting') {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  };

  const formatCommentsMessage = (comments: ReturnType<CommentStore['getAllComments']>): string => {
    let message = "Here are my comments on the diff for automatic fixes:\\n\\n";
    
    const commentsByFile: {[key: string]: typeof comments} = {};
    comments.forEach(comment => {
      if (!commentsByFile[comment.fileName]) {
        commentsByFile[comment.fileName] = [];
      }
      commentsByFile[comment.fileName].push(comment);
    });

    Object.entries(commentsByFile).forEach(([fileName, fileComments]) => {
      message += `File: ${fileName}\\n`;
      fileComments.forEach(comment => {
        message += `  Line: ${comment.lineText.trim() || '(empty line)'}\\n`;
        message += `  Comment: ${comment.commentText}\\n\\n`;
      });
      message += "\\n";
    });

    message += "Please review these comments and implement the suggested fixes.";
    return message;
  };

  const sendCommentsToTmux = async () => {
    const comments = commentStore.getAllComments();
    if (comments.length === 0) return;

    try {
      // Extract project and feature from worktreePath
      const pathSegments = worktreePath.split('/');
      const sessionName = `dev-${pathSegments.slice(-2).join('-')}`;
      
      // Check if session exists
      const sessionExists = tmuxService.listSessions().includes(sessionName);
      
      if (!sessionExists) {
        // Create new detached session
        runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', worktreePath]);
        
        // Start Claude if available
        const hasClaude = runCommand(['bash', '-lc', 'command -v claude || true']).trim();
        if (hasClaude) {
          runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'claude', 'C-m']);
          // Wait for Claude to start
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // Wait for Claude to be ready
      const ready = await waitForClaudeReady(sessionName, 10000);
      
      if (ready) {
        const message = formatCommentsMessage(comments);
        // Send comments to tmux session
        runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, message, 'C-m']);
        
        // Switch to that session to show user what happened
        try {
          runCommand(['tmux', 'switch-client', '-t', sessionName]);
        } catch {
          // If switch-client fails (no active client), try to attach interactively
          // This will exit the current app, but that's expected behavior
          runCommand(['tmux', 'attach-session', '-t', sessionName]);
        }
        
        // Clear comments after successful send
        commentStore.clear();
      } else {
        // If Claude isn't ready, still send the message but don't clear comments
        const message = formatCommentsMessage(comments);
        runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, message, 'C-m']);
      }
    } catch (error) {
      // If anything fails, silently continue
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

  // Truncate text to fit terminal width
  const truncateText = (text: string, maxWidth: number): string => {
    if (text.length <= maxWidth) return text;
    return text.substring(0, maxWidth - 3) + '...';
  };

  const visible = useMemo(() => lines.slice(offset, offset + pageSize), [lines, offset, pageSize]);

  const statusText = `Terminal: ${terminalHeight}x${terminalWidth} | PageSize: ${pageSize} | Pos: ${pos}/${lines.length} | Offset: ${offset} | Visible: ${visible.length} | Comments: ${commentStore.count}`;

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
    h(Text, {color: 'yellow'}, statusText),
    h(Text, {bold: true}, title),
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

