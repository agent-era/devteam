import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin, Static} from 'ink';
const h = React.createElement;
import {runCommandAsync} from '../../utils.js';
import {findBaseBranch} from '../../utils.js';
import {BASE_BRANCH_CANDIDATES} from '../../constants.js';

type DiffLine = {type: 'added'|'removed'|'context'|'header'; text: string};

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
  for (const line of raw) {
    if (line.startsWith('diff --git')) {
      const parts = line.split(' ');
      const fp = parts[3]?.slice(2) || parts[2]?.slice(2) || '';
      lines.push({type: 'header', text: `📁 ${fp}`});
    } else if (line.startsWith('@@')) {
      const ctx = line.replace(/^@@.*@@ ?/, '');
      if (ctx) lines.push({type: 'header', text: `  ▼ ${ctx}`});
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({type: 'added', text: line.slice(1)});
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lines.push({type: 'removed', text: line.slice(1)});
    } else if (line.startsWith(' ')) {
      lines.push({type: 'context', text: line.slice(1)});
    } else if (line === '') {
      lines.push({type: 'context', text: ' '}); // Empty line gets a space so cursor is visible
    }
  }
  // Append untracked files
  const untracked = await runCommandAsync(['git', '-C', worktreePath, 'ls-files', '--others', '--exclude-standard']);
  if (untracked) {
    for (const fp of untracked.split('\n').filter(Boolean)) {
      lines.push({type: 'header', text: `📁 ${fp} (new file)`});
      try {
        const cat = await runCommandAsync(['bash', '-lc', `cd ${JSON.stringify(worktreePath)} && sed -n '1,200p' ${JSON.stringify(fp)}`]);
        for (const l of (cat || '').split('\n').filter(Boolean)) lines.push({type: 'added', text: l});
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
  const [targetOffset, setTargetOffset] = useState(0);
  const [animationId, setAnimationId] = useState<NodeJS.Timeout | null>(null);
  const [terminalHeight, setTerminalHeight] = useState<number>(process.stdout.rows || 24);
  const [terminalWidth, setTerminalWidth] = useState<number>(process.stdout.columns || 80);

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

  // Calculate page size dynamically - reserve space for debug, title, and help
  const pageSize = Math.max(1, terminalHeight - 3);

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
    if (!isRawModeSupported) return;
    if (key.escape || input === 'q') return onClose();
    if (key.upArrow || input === 'k') setPos((p) => Math.max(0, p - 1));
    if (key.downArrow || input === 'j') setPos((p) => Math.min(lines.length - 1, p + 1));
    if (key.pageUp || input === 'b') setPos((p) => Math.max(0, p - pageSize));
    if (key.pageDown || input === 'f' || input === ' ') setPos((p) => Math.min(lines.length - 1, p + pageSize));
    if (input === 'g') setPos(0);
    if (input === 'G') setPos(Math.max(0, lines.length - 1));
    
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

  // Truncate text to fit terminal width
  const truncateText = (text: string, maxWidth: number): string => {
    if (text.length <= maxWidth) return text;
    return text.substring(0, maxWidth - 3) + '...';
  };

  const visible = useMemo(() => {
    return lines.slice(offset, offset + pageSize);
  }, [lines, offset, pageSize]);

  return h(
    Box,
    {flexDirection: 'column'},
    h(Text, {color: 'yellow'}, `Terminal: ${terminalHeight}x${terminalWidth} | PageSize: ${pageSize} | Pos: ${pos}/${lines.length} | Offset: ${offset} | Visible: ${visible.length}`),
    h(Text, {bold: true}, title),
    ...visible.map((l, idx) => {
      const actualLineIndex = offset + idx;
      const isCurrentLine = actualLineIndex === pos;
      const displayText = truncateText(l.text || ' ', terminalWidth - 2); // -2 for padding
      return h(Text, {
        key: idx,
        color: l.type === 'added' ? 'green' : l.type === 'removed' ? 'red' : l.type === 'header' ? 'cyan' : undefined,
        backgroundColor: isCurrentLine ? 'blue' : undefined,
        bold: isCurrentLine
      }, displayText);
    }),
    h(Text, {color: 'gray'}, 'j/k move  b/f PgUp/PgDn  g/G top/bottom  ←/→ chunk  Shift+←/→ file  q close')
  );
}

