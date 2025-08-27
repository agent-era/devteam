import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import {fitDisplay, padStartDisplay} from '../../utils.js';
import {useTextInput} from './TextInput.js';
const h = React.createElement;

type BranchInfo = {
  name: string; // may be origin/...
  local_name: string;
  ahead: number;
  behind: number;
  added_lines: number;
  deleted_lines: number;
  timestamp?: number;
  last_commit_date?: string;
  pr_number?: number | null;
  pr_state?: string | null;
  pr_checks?: string | null;
  pr_title?: string | null;
};

type Props = {
  branches: BranchInfo[];
  onSubmit: (remoteBranch: string, localName: string) => Promise<void> | void;
  onCancel: () => void;
  onRefresh?: () => void;
};

export default function BranchPickerDialog({branches, onSubmit, onCancel, onRefresh}: Props) {
  const filterInput = useTextInput();
  const [selected, setSelected] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(Math.max(1, (process.stdout.rows || 24) - 6));
  const {isRawModeSupported} = useStdin();
  const filtered = useMemo(() => {
    const f = filterInput.value.toLowerCase();
    const arr = branches.filter(b => (b.name + ' ' + b.local_name + ' ' + (b.pr_title || '')).toLowerCase().includes(f));
    arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return arr;
  }, [branches, filterInput.value]);
  useEffect(() => {
    const onResize = () => setPageSize(Math.max(1, (process.stdout.rows || 24) - 6));
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off?.('resize', onResize as any); };
  }, []);

  useInput((input, key) => {
    if (!isRawModeSupported) return;
    if (key.escape) return onCancel();
    
    // Handle control keys first
    if (key.return) {
      const b = filtered[selected];
      if (b) onSubmit(b.name, b.local_name);
      return;
    }
    
    if (input === 'r' && onRefresh) {
      onRefresh();
      return;
    }
    
    // Navigation keys
    if (key.downArrow || input === 'j') {
      setSelected((s) => Math.min(filtered.length - 1, s + 1));
      return;
    }
    if (key.upArrow || input === 'k') {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    if (key.pageDown || input === 'f') {
      setSelected((s) => Math.min(filtered.length - 1, s + pageSize));
      return;
    }
    if (key.pageUp || input === 'b') {
      setSelected((s) => Math.max(0, s - pageSize));
      return;
    }
    
    // Number keys for quick selection
    if (/^[1-9]$/.test(input)) {
      const idx = Number(input) - 1;
      if (idx >= 0 && idx < filtered.length) setSelected(idx);
      return;
    }
    
    // Let the filter input hook handle text input
    if (filterInput.handleKeyInput(input, key)) {
      return;
    }
  });

  const start = Math.floor(selected / pageSize) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const totalCols = process.stdout.columns || 80;
  // Column widths (sum + 6 spaces between cells should be <= totalCols)
  const NAME_WIDTH = 30;
  const LOCAL_WIDTH = 18;
  const DIFF_WIDTH = 12;   // +N/-M
  const CHG_WIDTH = 10;    // ↑N ↓M or synced/clean
  const DATE_WIDTH = 6;    // 2d, 3h, etc.
  const PR_WIDTH = 12;     // #N✓ etc
  const fixedWidth = NAME_WIDTH + LOCAL_WIDTH + DIFF_WIDTH + CHG_WIDTH + DATE_WIDTH + PR_WIDTH;
  const separators = 6; // spaces between 7 columns
  const TITLE_WIDTH = Math.max(10, totalCols - fixedWidth - separators);
  return h(
    Box, {flexDirection: 'column'},
    h(Text, {color: 'cyan'}, 'Create from Remote Branch'),
    h(Text, {color: 'gray'}, `Type to filter, j/k arrows, PgUp/PgDn, 1-9 jump, r refresh, Enter select, ESC cancel  [${Math.floor(selected / pageSize) + 1}/${Math.max(1, Math.ceil(filtered.length / pageSize))}]`),
    h(Box, {flexDirection: 'row'}, 
      h(Text, {color: 'gray'}, 'Filter: '),
      filterInput.renderText(' ')
    ),
    ...pageItems.map((b, i) => {
      const idx = start + i;
      const sel = idx === selected;
      const nameCol = fitDisplay(b.name || '', NAME_WIDTH);
      const localCol = fitDisplay(b.local_name || '', LOCAL_WIDTH);
      const diffCol = fitDisplay(`+${b.added_lines}/-${b.deleted_lines}`, DIFF_WIDTH);
      let chgRaw = '';
      if (b.ahead > 0) chgRaw += `↑${b.ahead} `;
      if (b.behind > 0) chgRaw += `↓${b.behind}`;
      if (!chgRaw) chgRaw = 'synced';
      const chgCol = fitDisplay(chgRaw, CHG_WIDTH);
      const dateCol = fitDisplay(b.last_commit_date || '', DATE_WIDTH);
      const prBadge = b.pr_number ? `#${b.pr_number}${b.pr_checks === 'passing' ? '✓' : b.pr_checks === 'failing' ? '✗' : b.pr_checks === 'pending' ? '⏳' : ''}` : '';
      const prCol = fitDisplay(prBadge, PR_WIDTH);
      const titleCol = fitDisplay(b.pr_title || '', TITLE_WIDTH);
      const row = `${padStartDisplay(sel ? '›' : ' ', 1)} ${nameCol} ${localCol} ${diffCol} ${chgCol} ${dateCol} ${prCol} ${titleCol}`;
      return h(Text, {key: b.name, color: sel ? 'green' : undefined}, row);
    })
  );
}
