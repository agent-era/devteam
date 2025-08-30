import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import {fitDisplay, padStartDisplay, stringDisplayWidth} from '../../shared/utils/formatting.js';
import {useTerminalDimensions} from '../../hooks/useTerminalDimensions.js';
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
  const {rows, columns} = useTerminalDimensions();
  const pageSize = Math.max(1, rows - 6); // Reserve space for dialog chrome
  const {isRawModeSupported} = useStdin();
  const filtered = useMemo(() => {
    const f = filterInput.value.toLowerCase();
    const arr = branches.filter(b => (b.name + ' ' + b.local_name + ' ' + (b.pr_title || '')).toLowerCase().includes(f));
    arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return arr;
  }, [branches, filterInput.value]);

  useInput((input, key) => {
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
  
  // Dynamic column widths based on terminal size and content (like MainView)
  const columnWidths = useMemo(() => {
    // Helper function to format large numbers with k suffix
    const formatNumber = (num: number) => {
      if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
      }
      return num.toString();
    };
    
    // Prepare data for width calculation
    const headerRow = ['BRANCH', 'DIFF', 'CHANGES', 'DATE', 'PR', 'TITLE'];
    const dataRows = pageItems.map((b) => {
      const diffStr = `+${formatNumber(b.added_lines)}/-${formatNumber(b.deleted_lines)}`;
      let chgRaw = '';
      if (b.ahead > 0) chgRaw += `↑${b.ahead} `;
      if (b.behind > 0) chgRaw += `↓${b.behind}`;
      if (!chgRaw) chgRaw = 'synced';
      const prBadge = b.pr_number ? `#${b.pr_number}${b.pr_checks === 'passing' ? '✓' : b.pr_checks === 'failing' ? '✗' : b.pr_checks === 'pending' ? '⏳' : ''}` : '';
      
      return [
        b.local_name || '',
        diffStr,
        chgRaw,
        b.last_commit_date || '',
        prBadge,
        b.pr_title || ''
      ];
    });
    
    const allRows = [headerRow, ...dataRows];
    
    // Set appropriate minimum widths per column: [BRANCH, DIFF, CHANGES, DATE, PR, TITLE]
    const columnMinWidths = [0, 12, 10, 6, 8, 0]; // BRANCH and TITLE calculated separately
    
    // Calculate content-based widths for all columns except BRANCH and TITLE
    const fixedWidths = [0, 1, 2, 3, 4, 5].map(colIndex => {
      if (colIndex === 0 || colIndex === 5) return 0; // BRANCH and TITLE calculated separately
      const maxContentWidth = Math.max(...allRows.map(row => stringDisplayWidth(row[colIndex] || '')));
      return Math.max(columnMinWidths[colIndex], maxContentWidth);
    });
    
    // Calculate space used by fixed columns + margins (5 spaces between 6 columns)
    const fixedColumnsWidth = fixedWidths.reduce((sum, width, index) => (index === 0 || index === 5) ? sum : sum + width, 0);
    const marginsWidth = 5; // 5 spaces between columns
    const usedWidth = fixedColumnsWidth + marginsWidth;
    
    // Calculate available width for BRANCH column (give it priority)
    const availableForBranch = Math.max(15, Math.floor((columns - usedWidth) * 0.4)); // 40% of remaining space, min 15
    const availableForTitle = Math.max(10, columns - usedWidth - availableForBranch); // Rest goes to title
    
    fixedWidths[0] = availableForBranch;
    fixedWidths[5] = availableForTitle;
    
    return fixedWidths;
  }, [pageItems, columns]);
  // Add header row for column labels
  const header = h(
    Box,
    {marginBottom: 0, flexDirection: 'row'},
    h(Text, {color: 'gray'}, '  '), // Space for selection indicator
    h(Box, {width: columnWidths[0], marginRight: 1}, h(Text, {color: 'gray', bold: true}, 'BRANCH')),
    h(Box, {width: columnWidths[1], justifyContent: 'flex-end', marginRight: 1}, h(Text, {color: 'gray', bold: true}, 'DIFF')),
    h(Box, {width: columnWidths[2], justifyContent: 'flex-end', marginRight: 1}, h(Text, {color: 'gray', bold: true}, 'CHANGES')),
    h(Box, {width: columnWidths[3], justifyContent: 'center', marginRight: 1}, h(Text, {color: 'gray', bold: true}, 'DATE')),
    h(Box, {width: columnWidths[4], justifyContent: 'center', marginRight: 1}, h(Text, {color: 'gray', bold: true}, 'PR')),
    h(Box, {width: columnWidths[5]}, h(Text, {color: 'gray', bold: true}, 'TITLE'))
  );

  return h(
    Box, {flexDirection: 'column'},
    h(Text, {color: 'cyan'}, 'Create from Remote Branch'),
    h(Text, {color: 'gray'}, `Type to filter, j/k arrows, PgUp/PgDn, 1-9 jump, r refresh, Enter select, ESC cancel  [${Math.floor(selected / pageSize) + 1}/${Math.max(1, Math.ceil(filtered.length / pageSize))}]`),
    h(Box, {flexDirection: 'row'}, 
      h(Text, {color: 'gray'}, 'Filter: '),
      filterInput.renderText(' ')
    ),
    header,
    ...pageItems.map((b, i) => {
      const idx = start + i;
      const sel = idx === selected;
      
      // Format data
      const formatNumber = (num: number) => {
        if (num >= 1000) {
          return (num / 1000).toFixed(1) + 'k';
        }
        return num.toString();
      };
      
      const diffStr = `+${formatNumber(b.added_lines)}/-${formatNumber(b.deleted_lines)}`;
      let chgRaw = '';
      if (b.ahead > 0) chgRaw += `↑${b.ahead} `;
      if (b.behind > 0) chgRaw += `↓${b.behind}`;
      if (!chgRaw) chgRaw = 'synced';
      
      const prBadge = b.pr_number ? `#${b.pr_number}${b.pr_checks === 'passing' ? '✓' : b.pr_checks === 'failing' ? '✗' : b.pr_checks === 'pending' ? '⏳' : ''}` : '';
      
      // Truncate branch name and title if too long
      const branchName = stringDisplayWidth(b.local_name || '') > columnWidths[0] 
        ? (b.local_name || '').slice(0, Math.max(0, columnWidths[0] - 3)) + '...'
        : b.local_name || '';
      const titleText = stringDisplayWidth(b.pr_title || '') > columnWidths[5] 
        ? (b.pr_title || '').slice(0, Math.max(0, columnWidths[5] - 3)) + '...'
        : b.pr_title || '';
      
      const common = {backgroundColor: sel ? 'blue' : undefined, bold: sel} as any;
      const color = sel ? 'green' : undefined;
      
      // Use Box-based layout for precise alignment (like MainView)
      return h(
        Box,
        {key: b.name, flexDirection: 'row'},
        h(Text, {...common, color}, sel ? '› ' : '  '),
        h(Box, {width: columnWidths[0], marginRight: 1}, h(Text, {...common, color}, branchName)),
        h(Box, {width: columnWidths[1], justifyContent: 'flex-end', marginRight: 1}, h(Text, {...common, color}, diffStr)),
        h(Box, {width: columnWidths[2], justifyContent: 'flex-end', marginRight: 1}, h(Text, {...common, color}, chgRaw)),
        h(Box, {width: columnWidths[3], justifyContent: 'center', marginRight: 1}, h(Text, {...common, color}, b.last_commit_date || '')),
        h(Box, {width: columnWidths[4], justifyContent: 'center', marginRight: 1}, h(Text, {...common, color}, prBadge)),
        h(Box, {width: columnWidths[5]}, h(Text, {...common, color}, titleText))
      );
    })
  );
}
