import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import SyntaxHighlight from 'ink-syntax-highlight';
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
import FileTreeOverlay from '../dialogs/FileTreeOverlay.js';
import {truncateDisplay, padEndDisplay, stringDisplayWidth} from '../../shared/utils/formatting.js';
import {LineWrapper} from '../../shared/utils/lineWrapper.js';
import {ViewportCalculator} from '../../shared/utils/viewport.js';

type DiffLine = {type: 'added'|'removed'|'context'|'header'; text: string; fileName?: string; headerType?: 'file' | 'hunk'};

type SideBySideLine = {
  left: {type: 'removed'|'context'|'header'|'empty'; text: string; fileName?: string; headerType?: 'file' | 'hunk'} | null;
  right: {type: 'added'|'context'|'header'|'empty'; text: string; fileName?: string; headerType?: 'file' | 'hunk'} | null;
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
  
  // Process main diff if it exists
  if (diff && diff.trim()) {
    const raw = diff.split('\n');
    let currentFileName = '';
    for (const line of raw) {
      if (line.startsWith('diff --git')) {
        const parts = line.split(' ');
        const fp = parts[3]?.slice(2) || parts[2]?.slice(2) || '';
        currentFileName = fp;
        lines.push({type: 'header', text: `📁 ${fp}`, fileName: fp, headerType: 'file'});
      } else if (line.startsWith('@@')) {
        const ctx = line.replace(/^@@.*@@ ?/, '');
        if (ctx) lines.push({type: 'header', text: `  ▼ ${ctx}`, fileName: currentFileName, headerType: 'hunk'});
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
  }
  // Append untracked files
  const untracked = await runCommandAsync(['git', '-C', worktreePath, 'ls-files', '--others', '--exclude-standard']);
  if (untracked) {
    for (const fp of untracked.split('\n').filter(Boolean)) {
      lines.push({type: 'header', text: `📁 ${fp} (new file)`, fileName: fp, headerType: 'file'});
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
        left: {type: 'header', text: line.text, fileName: line.fileName, headerType: line.headerType},
        right: {type: 'header', text: line.text, fileName: line.fileName, headerType: line.headerType},
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
  const [isFileNavigation, setIsFileNavigation] = useState(false);
  const [currentFileHeader, setCurrentFileHeader] = useState<string>('');
  const [currentHunkHeader, setCurrentHunkHeader] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('sidebyside');
  const [wrapMode, setWrapMode] = useState<WrapMode>('truncate');
  const commentStore = useMemo(() => commentStoreManager.getStore(worktreePath), [worktreePath]);
  const [tmuxService] = useState(() => new TmuxService());
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [showAllComments, setShowAllComments] = useState(true);
  const [showSessionWaitingDialog, setShowSessionWaitingDialog] = useState(false);
  const [sessionWaitingInfo, setSessionWaitingInfo] = useState<{sessionName: string}>({sessionName: ''});
  const [showUnsubmittedCommentsDialog, setShowUnsubmittedCommentsDialog] = useState(false);
  const [showFileTreeOverlay, setShowFileTreeOverlay] = useState(false);
  const [overlayHighlightedFile, setOverlayHighlightedFile] = useState<string>('');

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

  // Calculate page size dynamically - reserve space for title, help, sticky headers, and optional overlay area
  const helpReservedRows = showFileTreeOverlay ? 0 : 1; // hide help when overlay shows
  const overlayAreaHeight = showFileTreeOverlay ? Math.max(6, Math.floor(terminalHeight / 2)) : 0;
  const pageSize = Math.max(1, terminalHeight - 2 - stickyHeaderCount - helpReservedRows - overlayAreaHeight); // -1 title, -N sticky headers, -help, -overlay

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
    
    if (key.upArrow || input === 'k') {
      setSelectedLine(prev => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === 'j') {
      setSelectedLine(prev => Math.min(maxLineIndex, prev + 1));
    }
    if (key.pageUp || input === 'b') {
      setSelectedLine(prev => Math.max(0, prev - Math.floor(pageSize / 2)));
    }
    if (key.pageDown || input === 'f' || input === ' ') {
      setSelectedLine(prev => Math.min(maxLineIndex, prev + Math.floor(pageSize / 2)));
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
    
    // Previous file: Shift+Up or Ctrl+Up (undocumented)
    if (key.upArrow && (key.shift || key.ctrl)) {
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
          
          // Calculate scroll position to show the content line at top of viewport
          // This naturally makes the file header sticky (just above viewport)
          let targetRow = 0;
          if (wrapMode === 'truncate') {
            // In truncate mode, line index maps directly to scroll row
            targetRow = Math.max(0, contentLineIndex);
          } else {
            // In wrap mode, calculate the visual row position using LineWrapper
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
            
            // Calculate the visual row for the content line index using LineWrapper
            let targetRowStart = 0;
            for (let j = 0; j < Math.min(contentLineIndex, textLines.length); j++) {
              targetRowStart += LineWrapper.calculateHeight(textLines[j] || ' ', maxWidth);
            }
            targetRow = Math.max(0, targetRowStart);
          }
          
          // Set flag to prevent auto-scroll from overriding our scroll position
          setIsFileNavigation(true);
          setTargetScrollRow(targetRow);
          break;
        }
      }
    }
    
    // Next file: Shift+Down or Ctrl+Down (undocumented)
    if (key.downArrow && (key.shift || key.ctrl)) {
      const maxIndex = viewMode === 'unified' ? lines.length : sideBySideLines.length;
      for (let i = selectedLine + 1; i < maxIndex; i++) {
        if (isFileHeader(i)) {
          // Find the first content line after this file header
          const contentLineIndex = findFirstContentLineAfterHeader(i);
          setSelectedLine(contentLineIndex);
          // Highlight this file in overlay
          const fileName = viewMode === 'unified' ? (lines[i]?.fileName || '') : (sideBySideLines[i]?.left?.fileName || sideBySideLines[i]?.right?.fileName || '');
          if (fileName) showFileTree(fileName);
          
          // Calculate scroll position to show the content line at top of viewport
          // This naturally makes the file header sticky (just above viewport)
          let targetRow = 0;
          if (wrapMode === 'truncate') {
            // In truncate mode, line index maps directly to scroll row
            targetRow = Math.max(0, contentLineIndex);
          } else {
            // In wrap mode, calculate the visual row position using LineWrapper
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
            
            // Calculate the visual row for the content line index using LineWrapper
            let targetRowStart = 0;
            for (let j = 0; j < Math.min(contentLineIndex, textLines.length); j++) {
              targetRowStart += LineWrapper.calculateHeight(textLines[j] || ' ', maxWidth);
            }
            targetRow = Math.max(0, targetRowStart);
          }
          
          // Set flag to prevent auto-scroll from overriding our scroll position
          setIsFileNavigation(true);
          setTargetScrollRow(targetRow);
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
    
    // Don't override scroll position during file navigation (Shift+Up/Down)
    // File navigation sets a specific scroll position to make headers sticky
    if (newScrollRow !== targetScrollRow && !isFileNavigation) {
      const maxScrollRow = ViewportCalculator.getMaxScrollRow(textLines, pageSize, maxWidth, wrapMode);
      setTargetScrollRow(Math.max(0, Math.min(maxScrollRow, newScrollRow)));
    }
  }, [selectedLine, viewMode, wrapMode, terminalWidth, lines, sideBySideLines, pageSize, isFileNavigation]);

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
        prompt += `  Line ${comment.lineIndex + 1}: ${comment.lineText}\\n`;
        prompt += `  Comment: ${comment.commentText}\\n`;
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
        messageLines.push(`  Line ${comment.lineIndex + 1}: ${comment.lineText}`);
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
          tmuxService.sendText(sessionName, `claude ${JSON.stringify(commentPrompt)}`, { executeCommand: true });
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
        tmuxService.createSession(sessionName, worktreePath);
        const hasClaude = runCommand(['bash', '-lc', 'command -v claude || true']).trim();
        if (hasClaude) {
          // Launch Claude with the comments as the initial prompt!
          const commentPrompt = formatCommentsAsPrompt(comments);
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
        if (line.type === 'header' && line.headerType === 'file') {
          fileHeader = line.text;
          break;
        }
        if (!fileHeader && line.type === 'header' && line.headerType === 'hunk') {
          hunkHeader = line.text;
        }
      } else {
        const line = sideBySideLines[i];
        if (line.left?.type === 'header' && line.left.headerType === 'file') {
          fileHeader = line.left.text;
          break;
        }
        if (!fileHeader && line.left?.type === 'header' && line.left.headerType === 'hunk') {
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

  // Helper function to render syntax highlighted content
  const renderSyntaxHighlighted = (text: string, fileName: string | undefined, isSelected: boolean, diffColor?: string, lineType?: 'added'|'removed'|'context'|'header') => {
    const language = getLanguageFromFileName(fileName);
    
    // If the line is selected, use regular Text to ensure blue background is visible
    if (isSelected) {
      return (
        <Text 
          backgroundColor="blue"
          bold
          color={diffColor}
        >
          {text}
        </Text>
      );
    }
    
    // For removed lines in unified view, use plain red text without syntax highlighting
    if (lineType === 'removed') {
      return (
        <Text color="red">
          {text}
        </Text>
      );
    }
    
    // For context lines in unified view, use dimmed text without syntax highlighting
    if (lineType === 'context') {
      return (
        <Text dimColor>
          {text}
        </Text>
      );
    }
    
    // For added lines and side-by-side view, use syntax highlighting
    return (
      <SyntaxHighlight
        code={text}
        language={language}
      />
    );
  };

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
            (sideBySideLines[selectedLine]?.left?.fileName || sideBySideLines[selectedLine]?.right?.fileName || '')}
          lineText={viewMode === 'unified' ? 
            (lines[selectedLine]?.text || '') : 
            (sideBySideLines[selectedLine]?.left?.text || sideBySideLines[selectedLine]?.right?.text || '')}
          initialComment={(() => {
            if (viewMode === 'unified') {
              return lines[selectedLine]?.fileName ? commentStore.getComment(selectedLine, lines[selectedLine].fileName)?.commentText || '' : '';
            } else {
              const fileName = sideBySideLines[selectedLine]?.left?.fileName || sideBySideLines[selectedLine]?.right?.fileName;
              return fileName ? commentStore.getComment(sideBySideLines[selectedLine].lineIndex, fileName)?.commentText || '' : '';
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
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      {/* Sticky headers - only render when content exists */}
      {currentFileHeader && (
        <Text
          color="white"
          bold
          backgroundColor="gray"
        >
          {currentFileHeader}
        </Text>
      )}
      {currentHunkHeader && (
        <Text
          color="cyan"
          bold
          backgroundColor="gray"
        >
          {currentHunkHeader}
        </Text>
      )}
      {(() => {
        const renderedElements: React.ReactNode[] = [];
        let visibleLineIndex = 0;
        
        for (const l of visibleLines) {
          const actualLineIndex = viewport.visibleLines[visibleLineIndex];
          const isCurrentLine = actualLineIndex === selectedLine;
        
        if (viewMode === 'unified') {
          const unifiedLine = l as DiffLine;
          const hasComment = unifiedLine.fileName && commentStore.hasComment(actualLineIndex, unifiedLine.fileName);
          const commentIndicator = hasComment ? '[C] ' : '';
          
          // Determine gutter symbol
          let gutterSymbol = '  '; // default for context and headers
          if (unifiedLine.type === 'added') gutterSymbol = '+ ';
          else if (unifiedLine.type === 'removed') gutterSymbol = '- ';
          
          const fullText = commentIndicator + (unifiedLine.text || ' ');
          
          if (wrapMode === 'truncate') {
            // Truncate mode with gutter and diff colors
            if (unifiedLine.type === 'header') {
              const displayText = truncateDisplay(fullText, terminalWidth - 4); // -4 for gutter
              const headerColor = unifiedLine.headerType === 'file' ? 'white' : 'cyan';
              renderedElements.push(
                <Box
                  key={`line-${visibleLineIndex}`}
                  flexDirection="row"
                >
                  <Text
                    color="gray"
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                    bold={isCurrentLine}
                  >
                    {gutterSymbol}
                  </Text>
                  <Text
                    color={headerColor}
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                    bold
                  >
                    {displayText}
                  </Text>
                </Box>
              );
            } else {
              // Create gutter element
              const gutterElement = (
                <Text
                  color={unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : 'gray'}
                  backgroundColor={isCurrentLine ? 'blue' : undefined}
                  bold={isCurrentLine}
                >
                  {gutterSymbol}
                </Text>
              );
              
              const finalCodeText = truncateDisplay(unifiedLine.text || ' ', terminalWidth - (hasComment ? 8 : 4));
              
              if (hasComment) {
                const commentElement = (
                  <Text
                    color={unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : undefined}
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                    bold={isCurrentLine}
                  >
                    [C] 
                  </Text>
                );
                
                const codeElement = (
                  <Text
                    color={unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : undefined}
                    dimColor={unifiedLine.type === 'context'}
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                    bold={isCurrentLine}
                  >
                    {finalCodeText}
                  </Text>
                );
                
                renderedElements.push(
                  <Box
                    key={`line-${visibleLineIndex}`}
                    flexDirection="row"
                  >
                    {gutterElement}
                    {commentElement}
                    {codeElement}
                  </Box>
                );
              } else {
                const codeElement = (
                  <Text
                    color={unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : undefined}
                    dimColor={unifiedLine.type === 'context'}
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                    bold={isCurrentLine}
                  >
                    {finalCodeText}
                  </Text>
                );
                
                renderedElements.push(
                  <Box
                    key={`line-${visibleLineIndex}`}
                    flexDirection="row"
                  >
                    {gutterElement}
                    {codeElement}
                  </Box>
                );
              }
            }
          } else {
            // Wrap mode with gutter and diff colors
            const maxWidth = terminalWidth - 4; // -4 for gutter
            const segments = LineWrapper.wrapLine(fullText, maxWidth);
            
            segments.forEach((segment, segIdx) => {
              if (unifiedLine.type === 'header') {
                const headerColor = unifiedLine.headerType === 'file' ? 'white' : 'cyan';
                renderedElements.push(
                  <Box
                    key={`line-${visibleLineIndex}-seg-${segIdx}`}
                    flexDirection="row"
                  >
                    <Text
                      color="gray"
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                      bold={isCurrentLine}
                    >
                      {segIdx === 0 ? gutterSymbol : '  '}
                    </Text>
                    <Text
                      color={headerColor}
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                      bold
                    >
                      {segment}
                    </Text>
                  </Box>
                );
              } else {
                const gutterElement = (
                  <Text
                    color={unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : 'gray'}
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                    bold={isCurrentLine}
                  >
                    {segIdx === 0 ? gutterSymbol : '  '}
                  </Text>
                );
                
                // For wrapped segments, extract the actual code text (removing comment indicator from non-first segments)
                let codeText = segment;
                if (segIdx === 0 && hasComment) {
                  codeText = segment.replace('[C] ', '');
                  const commentElement = (
                    <Text
                      color={unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : undefined}
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                      bold={isCurrentLine}
                    >
                      [C] 
                    </Text>
                  );
                  
                  const codeElement = (
                    <Text
                      color={unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : undefined}
                      dimColor={unifiedLine.type === 'context'}
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                      bold={isCurrentLine}
                    >
                      {codeText}
                    </Text>
                  );
                  
                  renderedElements.push(
                    <Box
                      key={`line-${visibleLineIndex}-seg-${segIdx}`}
                      flexDirection="row"
                    >
                      {gutterElement}
                      {commentElement}
                      {codeElement}
                    </Box>
                  );
                } else {
                  const codeElement = (
                    <Text
                      color={unifiedLine.type === 'added' ? 'green' : unifiedLine.type === 'removed' ? 'red' : undefined}
                      dimColor={unifiedLine.type === 'context'}
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                      bold={isCurrentLine}
                    >
                      {codeText}
                    </Text>
                  );
                  
                  renderedElements.push(
                    <Box
                      key={`line-${visibleLineIndex}-seg-${segIdx}`}
                      flexDirection="row"
                    >
                      {gutterElement}
                      {codeElement}
                    </Box>
                  );
                }
              }
            });
          }
        } else {
          // Side-by-side diff rendering with syntax highlighting
          const sideBySideLine = l as SideBySideLine;
          const paneWidth = Math.floor((terminalWidth - 2) / 2); // Leave 2 cols slack to avoid terminal wrap
          
          // Get comment info based on the original line index
          const hasComment = (sideBySideLine.left?.fileName || sideBySideLine.right?.fileName) && 
                            commentStore.hasComment(sideBySideLine.lineIndex, sideBySideLine.left?.fileName || sideBySideLine.right?.fileName || '');
          const commentIndicator = hasComment ? '[C] ' : '';
          
          // Prepare left and right content
          const leftFullText = sideBySideLine.left ? (commentIndicator + (sideBySideLine.left.text || ' ')) : '';
          const rightFullText = sideBySideLine.right ? (sideBySideLine.right.text || ' ') : '';
          
          if (wrapMode === 'truncate') {
            // Truncate mode with syntax highlighting for side-by-side
            const leftText = leftFullText ? truncateDisplay(leftFullText, paneWidth - 2) : '';
            const rightText = rightFullText ? truncateDisplay(rightFullText, paneWidth - 2) : '';
            
            // Format left pane with syntax highlighting
            let leftElement;
            if (sideBySideLine.left) {
              if (sideBySideLine.left.type === 'header') {
                const headerColor = sideBySideLine.left.headerType === 'file' ? 'white' : 'cyan';
                leftElement = (
                  <Text
                    bold
                    color={headerColor}
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                  >
                    {padEndDisplay(' ' + leftText, paneWidth)}
                  </Text>
                );
              } else if (sideBySideLine.left.type === 'context' || sideBySideLine.left.type === 'empty') {
                leftElement = (
                  <Text
                    bold={isCurrentLine}
                    dimColor
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                  >
                    {padEndDisplay(' ' + leftText, paneWidth)}
                  </Text>
                );
              } else {
                // For removed lines, apply syntax highlighting
                const actualLeftText = hasComment ? sideBySideLine.left.text || ' ' : leftText.replace('[C] ', '');
                const truncatedText = truncateDisplay(actualLeftText, paneWidth - (hasComment ? 5 : 1));
                const leftSyntaxElement = renderSyntaxHighlighted(
                  truncatedText, 
                  sideBySideLine.left.fileName, 
                  isCurrentLine, 
                  undefined,
                  sideBySideLine.left.type
                );
                
                // Create the element with proper padding and comment indicator
                if (hasComment) {
                  const commentText = (
                    <Text
                      bold={isCurrentLine}
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                    >
                       [C] 
                    </Text>
                  );
                  leftElement = (
                    <Box
                      flexDirection="row"
                      width={paneWidth}
                    >
                      {commentText}
                      <Box
                        flexShrink={1}
                        flexGrow={0}
                      >
                        {leftSyntaxElement}
                      </Box>
                    </Box>
                  );
                } else {
                  leftElement = (
                    <Box
                      flexDirection="row"
                      width={paneWidth}
                    >
                      <Text
                        bold={isCurrentLine}
                        backgroundColor={isCurrentLine ? 'blue' : undefined}
                      >
                        {' '}
                      </Text>
                      <Box
                        flexShrink={1}
                        flexGrow={0}
                      >
                        {leftSyntaxElement}
                      </Box>
                    </Box>
                  );
                }
              }
            } else {
              leftElement = (
                <Text
                  bold={isCurrentLine}
                  dimColor
                  backgroundColor={isCurrentLine ? 'blue' : undefined}
                >
                  {padEndDisplay('', paneWidth)}
                </Text>
              );
            }
            
            // Format right pane with syntax highlighting
            let rightElement;
            if (sideBySideLine.right) {
              if (sideBySideLine.right.type === 'header') {
                const headerColor = sideBySideLine.right.headerType === 'file' ? 'white' : 'cyan';
                rightElement = (
                  <Text
                    bold
                    color={headerColor}
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                  >
                    {padEndDisplay(' ' + rightText, paneWidth)}
                  </Text>
                );
              } else if (sideBySideLine.right.type === 'context' || sideBySideLine.right.type === 'empty') {
                rightElement = (
                  <Text
                    bold={isCurrentLine}
                    dimColor
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                  >
                    {padEndDisplay(' ' + rightText, paneWidth)}
                  </Text>
                );
              } else {
                // For added lines, apply syntax highlighting using already truncated text
                const truncatedText = rightText;
                const rightSyntaxElement = renderSyntaxHighlighted(
                  truncatedText, 
                  sideBySideLine.right.fileName, 
                  isCurrentLine, 
                  undefined,
                  sideBySideLine.right.type
                );
                
                // Create the element with syntax highlighting constrained to paneWidth
                rightElement = (
                  <Box
                    flexDirection="row"
                    width={paneWidth}
                  >
                    <Text
                      bold={isCurrentLine}
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                    >
                      {' '}
                    </Text>
                    <Box
                      flexShrink={1}
                      flexGrow={0}
                    >
                      {rightSyntaxElement}
                    </Box>
                  </Box>
                );
              }
            } else {
              rightElement = (
                <Text
                  bold={isCurrentLine}
                  dimColor
                  backgroundColor={isCurrentLine ? 'blue' : undefined}
                >
                  {padEndDisplay('', paneWidth)}
                </Text>
              );
            }
            
            renderedElements.push(
              <Box
                key={`line-${visibleLineIndex}`}
                flexDirection="row"
              >
                {leftElement}
                {rightElement}
              </Box>
            );
          } else {
            // Wrap mode: handle wrapped side-by-side content with syntax highlighting
            const maxPaneWidth = paneWidth - 2;
            const leftSegments = leftFullText ? LineWrapper.wrapLine(leftFullText, maxPaneWidth) : [''];
            const rightSegments = rightFullText ? LineWrapper.wrapLine(rightFullText, maxPaneWidth) : [''];
            const maxSegments = Math.max(leftSegments.length, rightSegments.length);
            
            for (let segIdx = 0; segIdx < maxSegments; segIdx++) {
              const leftSegment = leftSegments[segIdx] || '';
              const rightSegment = rightSegments[segIdx] || '';
              
              // Apply syntax highlighting logic for wrapped segments
              let leftElement, rightElement;
              
              if (sideBySideLine.left && leftSegment) {
                if (sideBySideLine.left.type === 'header') {
                  const headerColor = sideBySideLine.left.headerType === 'file' ? 'white' : 'cyan';
                  leftElement = (
                    <Text
                      bold
                      color={headerColor}
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                    >
                      {padEndDisplay(' ' + leftSegment, paneWidth)}
                    </Text>
                  );
                } else if (sideBySideLine.left.type === 'context' || sideBySideLine.left.type === 'empty') {
                  leftElement = (
                    <Text
                      bold={isCurrentLine}
                      dimColor
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                    >
                      {padEndDisplay(' ' + leftSegment, paneWidth)}
                    </Text>
                  );
                } else {
                  // For wrapped removed lines in side-by-side, apply syntax highlighting
                  const leftSyntaxElement = renderSyntaxHighlighted(
                    leftSegment.replace('[C] ', ''), 
                    sideBySideLine.left.fileName, 
                    isCurrentLine, 
                    undefined,
                    sideBySideLine.left.type
                  );
                  
                  // Handle comment indicator for first segment
                  if (leftSegment.includes('[C] ') && segIdx === 0) {
                    leftElement = (
                      <Box
                        flexDirection="row"
                        width={paneWidth}
                      >
                        <Text
                          bold={isCurrentLine}
                          backgroundColor={isCurrentLine ? 'blue' : undefined}
                        >
                          {' [C] '}
                        </Text>
                        <Box
                          flexShrink={1}
                          flexGrow={0}
                        >
                          {leftSyntaxElement}
                        </Box>
                      </Box>
                    );
                  } else {
                    leftElement = (
                      <Box
                        flexDirection="row"
                        width={paneWidth}
                      >
                        <Text
                          bold={isCurrentLine}
                          backgroundColor={isCurrentLine ? 'blue' : undefined}
                        >
                          {' '}
                        </Text>
                        <Box
                          flexShrink={1}
                          flexGrow={0}
                        >
                          {leftSyntaxElement}
                        </Box>
                      </Box>
                    );
                  }
                }
              } else {
                leftElement = (
                  <Text
                    bold={isCurrentLine}
                    dimColor
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                  >
                    {padEndDisplay('', paneWidth)}
                  </Text>
                );
              }
              
              if (sideBySideLine.right && rightSegment) {
                if (sideBySideLine.right.type === 'header') {
                  const headerColor = sideBySideLine.right.headerType === 'file' ? 'white' : 'cyan';
                  rightElement = (
                    <Text
                      bold
                      color={headerColor}
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                    >
                      {padEndDisplay(' ' + rightSegment, paneWidth)}
                    </Text>
                  );
                } else if (sideBySideLine.right.type === 'context' || sideBySideLine.right.type === 'empty') {
                  rightElement = (
                    <Text
                      bold={isCurrentLine}
                      dimColor
                      backgroundColor={isCurrentLine ? 'blue' : undefined}
                    >
                      {padEndDisplay(' ' + rightSegment, paneWidth)}
                    </Text>
                  );
                } else {
                  // For wrapped added lines in side-by-side, apply syntax highlighting
                  const rightSyntaxElement = renderSyntaxHighlighted(
                    rightSegment, 
                    sideBySideLine.right.fileName, 
                    isCurrentLine, 
                    undefined,
                    sideBySideLine.right.type
                  );
                  
                  rightElement = (
                    <Box
                      flexDirection="row"
                      width={paneWidth}
                    >
                      <Text
                        bold={isCurrentLine}
                        backgroundColor={isCurrentLine ? 'blue' : undefined}
                      >
                        {' '}
                      </Text>
                      <Box
                        flexShrink={1}
                        flexGrow={0}
                      >
                        {rightSyntaxElement}
                      </Box>
                    </Box>
                  );
                }
              } else {
                rightElement = (
                  <Text
                    bold={isCurrentLine}
                    dimColor
                    backgroundColor={isCurrentLine ? 'blue' : undefined}
                  >
                    {padEndDisplay('', paneWidth)}
                  </Text>
                );
              }
              
              renderedElements.push(
                <Box
                  key={`line-${visibleLineIndex}-seg-${segIdx}`}
                  flexDirection="row"
                >
                  {leftElement}
                  {rightElement}
                </Box>
              );
            }
          }
        }
        
        visibleLineIndex++;
      }
      
        return renderedElements;
      })()}
      
      {showAllComments && commentStore.count > 0 && (
        <Box flexDirection="column" borderStyle="single" borderColor="blue" padding={1} marginTop={1}>
          <Text bold color="blue">
            All Comments ({commentStore.count}):
          </Text>
          {commentStore.getAllComments().map((comment, idx) => (
            <Text key={idx} color="gray">
              {comment.fileName}:{comment.lineIndex} - {comment.commentText}
            </Text>
          ))}
        </Box>
      )}
      
      {!showFileTreeOverlay && (
        <Text color="gray">
          {truncateDisplay(`j/k move  v toggle view (${viewMode})  w toggle wrap (${wrapMode})  c comment  C show all  d delete  S send to Claude  q close`, terminalWidth)}
        </Text>
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
