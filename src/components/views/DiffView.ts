import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import SyntaxHighlight from 'ink-syntax-highlight';
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

type DiffLine = {type: 'added'|'removed'|'context'|'header'; text: string; fileName?: string};

type SideBySideLine = {
  left: {type: 'removed'|'context'|'header'|'empty'; text: string; fileName?: string} | null;
  right: {type: 'added'|'context'|'header'|'empty'; text: string; fileName?: string} | null;
  lineIndex: number; // Original line index for comments and navigation
};

// Map file extensions to language identifiers for syntax highlighting
function getLanguageFromFileName(fileName: string | undefined): string {
  if (!fileName) return 'plaintext';
  
  const ext = fileName.split('.').pop()?.toLowerCase();
  const languageMap: {[key: string]: string} = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'fish': 'bash',
    'ps1': 'powershell',
    'json': 'json',
    'xml': 'xml',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'scss',
    'less': 'less',
    'sql': 'sql',
    'md': 'markdown',
    'markdown': 'markdown',
    'yml': 'yaml',
    'yaml': 'yaml',
    'toml': 'toml',
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'cmake': 'cmake',
    'vim': 'vim',
    'lua': 'lua',
    'r': 'r',
    'R': 'r',
    'dart': 'dart',
    'ex': 'elixir',
    'exs': 'elixir',
    'erl': 'erlang',
    'hrl': 'erlang',
    'fs': 'fsharp',
    'fsx': 'fsharp',
    'ml': 'ocaml',
    'mli': 'ocaml',
    'clj': 'clojure',
    'cljs': 'clojure',
    'elm': 'elm',
    'jl': 'julia',
    'nim': 'nim',
    'nix': 'nix',
    'hs': 'haskell',
    'pl': 'perl',
    'pm': 'perl',
    'tcl': 'tcl',
    'vb': 'vbnet',
    'pas': 'pascal',
    'pp': 'pascal',
    'proto': 'protobuf',
    'tf': 'hcl',
    'tfvars': 'hcl',
    'hcl': 'hcl',
    'zig': 'zig',
    'v': 'v',
    'vala': 'vala',
    'ada': 'ada',
    'adb': 'ada',
    'ads': 'ada',
    'asm': 'x86asm',
    's': 'x86asm',
  };
  
  // Special case for files without extensions or with specific names
  const baseName = fileName.split('/').pop()?.toLowerCase();
  if (baseName === 'dockerfile' || baseName === 'containerfile') return 'dockerfile';
  if (baseName === 'makefile' || baseName === 'gnumakefile') return 'makefile';
  if (baseName === 'cmakelists.txt') return 'cmake';
  if (baseName === 'rakefile') return 'ruby';
  if (baseName === 'gemfile') return 'ruby';
  if (baseName === 'podfile') return 'ruby';
  if (baseName === 'vagrantfile') return 'ruby';
  if (baseName === 'brewfile') return 'ruby';
  if (baseName === 'guardfile') return 'ruby';
  if (baseName === 'capfile') return 'ruby';
  if (baseName === 'thorfile') return 'ruby';
  if (baseName === 'berksfile') return 'ruby';
  if (baseName === 'pryrc') return 'ruby';
  if (baseName === '.gitignore' || baseName === '.dockerignore') return 'properties';
  if (baseName === '.env' || baseName?.startsWith('.env.')) return 'properties';
  
  return languageMap[ext || ''] || 'plaintext';
}

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

export default function DiffView({worktreePath, title = 'Diff Viewer', onClose, diffType = 'full', onAttachToSession}: Props) {
  const {rows: terminalHeight, columns: terminalWidth} = useTerminalDimensions();
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [sideBySideLines, setSideBySideLines] = useState<SideBySideLine[]>([]);
  const [pos, setPos] = useState(0);
  const [offset, setOffset] = useState(0);
  const [targetOffset, setTargetOffset] = useState(0);
  const [animationId, setAnimationId] = useState<NodeJS.Timeout | null>(null);
  const [currentFileHeader, setCurrentFileHeader] = useState<string>('');
  const [currentHunkHeader, setCurrentHunkHeader] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('unified');
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
      setOffset(0);
      setTargetOffset(0);
      setPos(0);
    })();
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
    const maxLines = viewMode === 'unified' ? lines.length - 1 : sideBySideLines.length - 1;
    if (key.upArrow || input === 'k') setPos((p) => Math.max(0, p - 1));
    if (key.downArrow || input === 'j') setPos((p) => Math.min(maxLines, p + 1));
    if (key.pageUp || input === 'b') setPos((p) => Math.max(0, p - pageSize));
    if (key.pageDown || input === 'f' || input === ' ') setPos((p) => Math.min(maxLines, p + pageSize));
    if (input === 'g') setPos(0);
    if (input === 'G') setPos(Math.max(0, maxLines));
    
    // View mode toggle
    if (input === 'v') {
      setViewMode(current => current === 'unified' ? 'sidebyside' : 'unified');
    }
    
    // Comment functionality
    if (input === 'c') {
      if (viewMode === 'unified') {
        const currentLine = lines[pos];
        if (currentLine && currentLine.fileName && currentLine.type !== 'header') {
          setShowCommentDialog(true);
        }
      } else {
        const currentLine = sideBySideLines[pos];
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
        const currentLine = lines[pos];
        if (currentLine && currentLine.fileName) {
          commentStore.removeComment(pos, currentLine.fileName);
        }
      } else {
        const currentLine = sideBySideLines[pos];
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
      for (let i = pos - 1; i >= 0; i--) {
        if (isChunkHeader(i)) {
          setPos(i);
          setTargetOffset(i); // Position chunk at top of screen with smooth scrolling
          break;
        }
      }
    }
    
    // Right arrow: jump to next chunk (▼ header)
    if (key.rightArrow) {
      const maxIndex = viewMode === 'unified' ? lines.length : sideBySideLines.length;
      for (let i = pos + 1; i < maxIndex; i++) {
        if (isChunkHeader(i)) {
          setPos(i);
          setTargetOffset(i); // Position chunk at top of screen with smooth scrolling
          break;
        }
      }
    }
    
    // Previous file: Shift+Left
    if (key.leftArrow && key.shift) {
      for (let i = pos - 1; i >= 0; i--) {
        if (isFileHeader(i)) {
          setPos(i);
          setTargetOffset(i); // Position file at top of screen with smooth scrolling
          break;
        }
      }
    }
    
    // Next file: Shift+Right
    if (key.rightArrow && key.shift) {
      const maxIndex = viewMode === 'unified' ? lines.length : sideBySideLines.length;
      for (let i = pos + 1; i < maxIndex; i++) {
        if (isFileHeader(i)) {
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
    
    const maxScrollOffset = viewMode === 'unified' ? lines.length - pageSize : sideBySideLines.length - pageSize;
    
    if (newTargetOffset !== targetOffset) {
      setTargetOffset(Math.max(0, Math.min(maxScrollOffset, newTargetOffset)));
    }
  }, [pos, targetOffset, pageSize, lines.length, sideBySideLines.length, viewMode]);

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
      const currentLine = lines[pos];
      if (currentLine && currentLine.fileName) {
        commentStore.addComment(pos, currentLine.fileName, currentLine.text, commentText);
      }
    } else {
      const currentLine = sideBySideLines[pos];
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

  // Truncate text to fit terminal width
  const truncateText = (text: string, maxWidth: number): string => {
    if (text.length <= maxWidth) return text;
    return text.substring(0, maxWidth - 3) + '...';
  };

  // Update sticky headers based on scroll offset
  useEffect(() => {
    const dataLength = viewMode === 'unified' ? lines.length : sideBySideLines.length;
    if (dataLength === 0) return;

    let fileHeader = '';
    let hunkHeader = '';
    let fileHeaderIndex = -1;
    let hunkHeaderIndex = -1;

    // Search backwards from offset-1 to find headers that have scrolled off screen
    for (let i = offset - 1; i >= 0; i--) {
      let lineData;
      if (viewMode === 'unified') {
        lineData = lines[i];
        if (!lineData) continue;

        // Find hunk header first (only if we haven't found the file yet)
        if (hunkHeaderIndex === -1 && fileHeaderIndex === -1 && lineData.type === 'header' && lineData.text.includes('▼')) {
          hunkHeader = lineData.text;
          hunkHeaderIndex = i;
        }

        // Find file header
        if (fileHeaderIndex === -1 && lineData.type === 'header' && lineData.text.startsWith('📁')) {
          fileHeader = lineData.text;
          fileHeaderIndex = i;
          
          // Clear hunk if it belongs to a different file
          if (hunkHeaderIndex !== -1 && hunkHeaderIndex < fileHeaderIndex) {
            hunkHeader = '';
            hunkHeaderIndex = -1;
          }
          break; // Found file, we're done
        }
      } else {
        lineData = sideBySideLines[i];
        if (!lineData || !lineData.left) continue;

        // Find hunk header first (only if we haven't found the file yet)
        if (hunkHeaderIndex === -1 && fileHeaderIndex === -1 && lineData.left.type === 'header' && lineData.left.text.includes('▼')) {
          hunkHeader = lineData.left.text;
          hunkHeaderIndex = i;
        }

        // Find file header
        if (fileHeaderIndex === -1 && lineData.left.type === 'header' && lineData.left.text.startsWith('📁')) {
          fileHeader = lineData.left.text;
          fileHeaderIndex = i;
          
          // Clear hunk if it belongs to a different file
          if (hunkHeaderIndex !== -1 && hunkHeaderIndex < fileHeaderIndex) {
            hunkHeader = '';
            hunkHeaderIndex = -1;
          }
          break; // Found file, we're done
        }
      }
    }

    // Only show headers that have actually scrolled off screen
    const shouldShowFileHeader = fileHeaderIndex >= 0 && fileHeaderIndex < offset;
    const shouldShowHunkHeader = hunkHeaderIndex >= 0 && hunkHeaderIndex < offset;

    setCurrentFileHeader(shouldShowFileHeader ? fileHeader : '');
    setCurrentHunkHeader(shouldShowHunkHeader ? hunkHeader : '');
  }, [lines, sideBySideLines, offset, viewMode]);

  const visible = useMemo(() => {
    if (viewMode === 'unified') {
      return lines.slice(offset, offset + pageSize);
    } else {
      return sideBySideLines.slice(offset, offset + pageSize);
    }
  }, [lines, sideBySideLines, offset, pageSize, viewMode]);

  // Helper function to render syntax highlighted content
  const renderSyntaxHighlighted = (text: string, fileName: string | undefined, isSelected: boolean, diffColor?: string, lineType?: 'added'|'removed'|'context'|'header') => {
    const language = getLanguageFromFileName(fileName);
    
    // If the line is selected, use regular Text to ensure blue background is visible
    if (isSelected) {
      return h(Text, {
        backgroundColor: 'blue',
        bold: true,
        color: diffColor
      }, text);
    }
    
    // For removed lines in unified view, use plain red text without syntax highlighting
    if (lineType === 'removed') {
      return h(Text, {
        color: 'red'
      }, text);
    }
    
    // For context lines in unified view, use dimmed text without syntax highlighting
    if (lineType === 'context') {
      return h(Text, {
        dimColor: true
      }, text);
    }
    
    // For added lines and side-by-side view, use syntax highlighting
    return h(SyntaxHighlight, {
      code: text,
      language: language
    });
  };

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
          (lines[pos]?.fileName || '') : 
          (sideBySideLines[pos]?.left?.fileName || sideBySideLines[pos]?.right?.fileName || ''),
        lineText: viewMode === 'unified' ? 
          (lines[pos]?.text || '') : 
          (sideBySideLines[pos]?.left?.text || sideBySideLines[pos]?.right?.text || ''),
        initialComment: (() => {
          if (viewMode === 'unified') {
            return lines[pos]?.fileName ? commentStore.getComment(pos, lines[pos].fileName)?.commentText || '' : '';
          } else {
            const fileName = sideBySideLines[pos]?.left?.fileName || sideBySideLines[pos]?.right?.fileName;
            return fileName ? commentStore.getComment(sideBySideLines[pos].lineIndex, fileName)?.commentText || '' : '';
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
      
      if (viewMode === 'unified') {
        // Unified diff rendering with gutter and improved coloring
        const unifiedLine = l as DiffLine;
        const hasComment = unifiedLine.fileName && commentStore.hasComment(actualLineIndex, unifiedLine.fileName);
        const commentIndicator = hasComment ? '[C] ' : '';
        
        // Determine gutter symbol
        let gutterSymbol = '  '; // default for context and headers
        if (unifiedLine.type === 'added') gutterSymbol = '+ ';
        else if (unifiedLine.type === 'removed') gutterSymbol = '- ';
        
        // For headers, use regular Text with gutter
        if (unifiedLine.type === 'header') {
          const displayText = truncateText(commentIndicator + (unifiedLine.text || ' '), terminalWidth - 4); // -4 for gutter (2) + padding (2)
          return h(Box, {
            key: idx,
            flexDirection: 'row'
          },
            h(Text, {
              color: 'gray',
              backgroundColor: isCurrentLine ? 'blue' : undefined,
              bold: isCurrentLine
            }, gutterSymbol),
            h(Text, {
              color: 'cyan',
              backgroundColor: isCurrentLine ? 'blue' : undefined,
              bold: isCurrentLine
            }, displayText)
          );
        }
        
        // For code lines, apply new coloring strategy with gutter
        const finalCodeText = truncateText(unifiedLine.text || ' ', terminalWidth - (hasComment ? 8 : 4)); // Account for gutter + comment indicator
        
        // Create gutter element
        const gutterElement = h(Text, {
          color: unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : 'gray',
          backgroundColor: isCurrentLine ? 'blue' : undefined,
          bold: isCurrentLine
        }, gutterSymbol);
        
        // Create content elements
        if (hasComment) {
          const commentElement = h(Text, {
            color: unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : undefined,
            backgroundColor: isCurrentLine ? 'blue' : undefined,
            bold: isCurrentLine
          }, '[C] ');
          
          const codeElement = renderSyntaxHighlighted(finalCodeText, unifiedLine.fileName, isCurrentLine, undefined, unifiedLine.type);
          
          return h(Box, {
            key: idx,
            flexDirection: 'row'
          }, gutterElement, commentElement, codeElement);
        }
        
        // No comment, just gutter + code
        const codeElement = renderSyntaxHighlighted(finalCodeText, unifiedLine.fileName, isCurrentLine, undefined, unifiedLine.type);
        
        return h(Box, {
          key: idx,
          flexDirection: 'row'
        }, gutterElement, codeElement);
      } else {
        // Side-by-side diff rendering with syntax highlighting
        const sideBySideLine = l as SideBySideLine;
        const paneWidth = Math.floor((terminalWidth - 1) / 2); // -1 for separator
        
        // Get comment info based on the original line index
        const hasComment = (sideBySideLine.left?.fileName || sideBySideLine.right?.fileName) && 
                          commentStore.hasComment(sideBySideLine.lineIndex, sideBySideLine.left?.fileName || sideBySideLine.right?.fileName || '');
        const commentIndicator = hasComment ? '[C] ' : '';
        
        // Format left pane
        let leftElement;
        if (sideBySideLine.left) {
          const leftText = truncateText(commentIndicator + (sideBySideLine.left.text || ' '), paneWidth - 2);
          
          if (sideBySideLine.left.type === 'header') {
            leftElement = h(Text, {
              bold: isCurrentLine,
              color: 'cyan',
              backgroundColor: isCurrentLine ? 'blue' : undefined
            }, (' ' + leftText).padEnd(paneWidth));
          } else if (sideBySideLine.left.type === 'context' || sideBySideLine.left.type === 'empty') {
            leftElement = h(Text, {
              bold: isCurrentLine,
              dimColor: true,
              backgroundColor: isCurrentLine ? 'blue' : undefined
            }, (' ' + leftText).padEnd(paneWidth));
          } else {
            // For removed lines, apply syntax highlighting
            const leftSyntaxElement = renderSyntaxHighlighted(
              sideBySideLine.left.text || ' ', 
              sideBySideLine.left.fileName, 
              isCurrentLine, 
              'red',
              sideBySideLine.left.type
            );
            leftElement = h(Box, {
              width: paneWidth
            },
              hasComment && h(Text, {
                backgroundColor: isCurrentLine ? 'blue' : undefined,
                bold: isCurrentLine
              }, ' [C] '),
              leftSyntaxElement
            );
          }
        } else {
          leftElement = h(Text, {
            bold: isCurrentLine,
            dimColor: true,
            backgroundColor: isCurrentLine ? 'blue' : undefined
          }, ''.padEnd(paneWidth));
        }
        
        // Format right pane
        let rightElement;
        if (sideBySideLine.right) {
          const rightText = truncateText(sideBySideLine.right.text || ' ', paneWidth - 2);
          
          if (sideBySideLine.right.type === 'header') {
            rightElement = h(Text, {
              bold: isCurrentLine,
              color: 'cyan',
              backgroundColor: isCurrentLine ? 'blue' : undefined
            }, (' ' + rightText).padEnd(paneWidth));
          } else if (sideBySideLine.right.type === 'context' || sideBySideLine.right.type === 'empty') {
            rightElement = h(Text, {
              bold: isCurrentLine,
              dimColor: true,
              backgroundColor: isCurrentLine ? 'blue' : undefined
            }, (' ' + rightText).padEnd(paneWidth));
          } else {
            // For added lines, apply syntax highlighting
            const rightSyntaxElement = renderSyntaxHighlighted(
              sideBySideLine.right.text || ' ',
              sideBySideLine.right.fileName,
              isCurrentLine,
              'green',
              sideBySideLine.right.type
            );
            rightElement = h(Box, {
              width: paneWidth
            },
              h(Text, null, ' '), // Space padding
              rightSyntaxElement
            );
          }
        } else {
          rightElement = h(Text, {
            bold: isCurrentLine,
            dimColor: true,
            backgroundColor: isCurrentLine ? 'blue' : undefined
          }, ''.padEnd(paneWidth));
        }
        
        // Create independent Text components for each pane
        return h(Box, {
          key: idx,
          flexDirection: 'row'
        }, 
          leftElement,
          // Separator
          h(Text, {
            bold: isCurrentLine,
            backgroundColor: isCurrentLine ? 'blue' : undefined
          }, '│'),
          rightElement
        );
      }
    }),
    showAllComments && commentStore.count > 0 ? h(
      Box,
      {flexDirection: 'column', borderStyle: 'single', borderColor: 'blue', padding: 1, marginTop: 1},
      h(Text, {bold: true, color: 'blue'}, `All Comments (${commentStore.count}):`),
      ...commentStore.getAllComments().map((comment, idx) => 
        h(Text, {key: idx, color: 'gray'}, `${comment.fileName}:${comment.lineIndex} - ${comment.commentText}`)
      )
    ) : null,
    h(Text, {color: 'gray'}, `j/k move  v toggle view (${viewMode})  c comment  C show all  d delete  S send to Claude  q close`)
  );
}