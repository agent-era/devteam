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

export default function CleanDiffView({worktreePath, title = 'Diff Viewer', onClose, diffType = 'full'}: Props) {
  const {isRawModeSupported} = useStdin();
  const [lines, setLines] = useState<DiffLine[]>([]);
  const [pos, setPos] = useState(0);
  const [offset, setOffset] = useState(0);
  const [terminalHeight, setTerminalHeight] = useState<number>(process.stdout.rows || 24);
  const [terminalWidth, setTerminalWidth] = useState<number>(process.stdout.columns || 80);

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

  // Truncate text to fit terminal width
  const truncateText = (text: string, maxWidth: number): string => {
    if (text.length <= maxWidth) return text;
    return text.substring(0, maxWidth - 3) + '...';
  };

  const visible = useMemo(() => lines.slice(offset, offset + pageSize), [lines, offset, pageSize]);

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

