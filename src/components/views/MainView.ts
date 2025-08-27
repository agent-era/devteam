import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
const h = React.createElement;
import type {WorktreeInfo} from '../../models.js';
import {
    COL_NUMBER_WIDTH,
    COL_AI_WIDTH,
    COL_DIFF_WIDTH,
    COL_CHANGES_WIDTH,
    COL_PR_WIDTH,
    SYMBOL_NO_SESSION,
    SYMBOL_IDLE,
    SYMBOL_WORKING,
    SYMBOL_WAITING,
    SYMBOL_THINKING,
    SYMBOL_FAILED,
    GIT_AHEAD,
    GIT_BEHIND,
    USE_EMOJI_SYMBOLS,
    ASCII_SYMBOLS,
  } from '../../constants.js';

// props: {worktrees, selectedIndex, onMove, onSelect, onQuit}
type Prompt = {title?: string; text?: string; hint?: string};
type Props = {
  worktrees: WorktreeInfo[];
  selectedIndex: number;
  onMove?: (delta: number) => void;
  onSelect?: (index: number) => void;
  onQuit?: () => void;
  mode?: 'message' | 'prompt';
  prompt?: Prompt;
  message?: string;
  page?: number;
  pageSize?: number;
};

export default function MainView(props: Props) {
  const {worktrees, selectedIndex, mode, prompt, message, page = 0, pageSize = 20} = props;

  // Auto-grid: Calculate optimal column widths based on content with min/max constraints
  const columnWidths = useMemo(() => {
    const start = page * pageSize;
    const pageItems = worktrees.slice(start, start + pageSize);
    
    // Helper function to format large numbers with k suffix
    const formatNumber = (num: number) => {
      if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
      }
      return num.toString();
    };
    
    // Column constraints: [minWidth, maxWidth]
    const constraints = [
      [4, 4],      // # column
      [20, 150],    // PROJECT/FEATURE
      [4, 4],      // AI
      [5, 12],     // DIFF
      [8, 15],     // CHANGES
      [7, 7],      // PUSHED
      [6, 8],      // PR
    ];
    
    // Prepare data for width calculation
    const headerRow = ['#', 'PROJECT/FEATURE', 'AI', 'DIFF', 'CHANGES', 'PUSHED', 'PR'];
    const dataRows = pageItems.map((w, i0) => {
      const added = w.git?.base_added_lines || 0;
      const deleted = w.git?.base_deleted_lines || 0;
      const diffStr = (added === 0 && deleted === 0) ? '-' : `+${formatNumber(added)}/-${formatNumber(deleted)}`;
      
      const ahead = w.git?.ahead || 0;
      const behind = w.git?.behind || 0;
      let changes = '';
      if (ahead > 0) changes += `${GIT_AHEAD}${ahead} `;
      if (behind > 0) changes += `${GIT_BEHIND}${behind}`;
      if (!changes) changes = '-'; // No commits ahead/behind base branch
      
      // PUSHED column: show push status to remote
      let pushed = '';
      if (w.git?.has_remote) {
        if (w.git.ahead === 0 && !w.git.has_changes) {
          pushed = '✓'; // All changes are pushed
        } else {
          pushed = '↗'; // Has unpushed commits or changes
        }
      } else {
        pushed = '-'; // No remote configured
      }
      
      const pr = w.pr;
      let prStr = '';
      if (pr?.number) {
        const badge = pr.has_conflicts ? '⚠️' : (pr.is_merged || pr.state === 'MERGED') ? '⟫' : pr.checks === 'passing' ? '✓' : pr?.checks === 'failing' ? '✗' : pr?.checks === 'pending' ? '⏳' : '';
        prStr = `#${pr.number}${badge}`;
      } else if (pr !== undefined) {
        prStr = '-'; // PR data loaded, no PR exists
      } else {
        prStr = ''; // PR data still loading
      }
      
      return [
        String(i0 + 1),
        `${w.project}/${w.feature}`,
        'AI', // placeholder, actual symbol set later
        diffStr,
        changes,
        pushed,
        prStr
      ];
    });
    
    const allRows = [headerRow, ...dataRows];
    
    // Calculate optimal width for each column
    return headerRow.map((_, colIndex) => {
      const maxContentWidth = Math.max(...allRows.map(row => row[colIndex]?.length || 0));
      const [minWidth, maxWidth] = constraints[colIndex];
      return Math.max(minWidth, Math.min(maxWidth, maxContentWidth));
    });
  }, [worktrees, page, pageSize]);

  const rows = useMemo(() => {
    const start = page * pageSize;
    const pageItems = worktrees.slice(start, start + pageSize);
    
    return pageItems.map((w, i0) => {
      const i = start + i0;
      const selected = i === selectedIndex;
      const cs = (w.session?.claude_status || '').toLowerCase();
      let aiSymbol = SYMBOL_FAILED;
      if (!w.session?.attached) aiSymbol = SYMBOL_NO_SESSION;
      else if (cs.includes('waiting')) aiSymbol = SYMBOL_WAITING;
      else if (cs.includes('working')) aiSymbol = SYMBOL_WORKING;
      else if (cs.includes('thinking')) aiSymbol = SYMBOL_THINKING;
      else if (cs.includes('idle') || cs.includes('active')) aiSymbol = SYMBOL_IDLE;

      if (!USE_EMOJI_SYMBOLS) {
        aiSymbol = aiSymbol === SYMBOL_NO_SESSION ? ASCII_SYMBOLS.NO_SESSION
          : aiSymbol === SYMBOL_WAITING ? ASCII_SYMBOLS.WAITING
          : aiSymbol === SYMBOL_WORKING ? ASCII_SYMBOLS.WORKING
          : aiSymbol === SYMBOL_THINKING ? ASCII_SYMBOLS.THINKING
          : aiSymbol === SYMBOL_IDLE ? ASCII_SYMBOLS.IDLE
          : aiSymbol === SYMBOL_FAILED ? ASCII_SYMBOLS.FAILED
          : aiSymbol; // default fallback
      }

      const num = String(i0 + 1);
      const pf = `${w.project}/${w.feature}`;
      // AI symbol without padding - let Ink handle the fixed width of 2
      const ai = aiSymbol;

      const added = w.git?.base_added_lines || 0;
      const deleted = w.git?.base_deleted_lines || 0;
      
      // Helper function to format large numbers with k suffix
      const formatNumber = (num: number) => {
        if (num >= 1000) {
          return (num / 1000).toFixed(1) + 'k';
        }
        return num.toString();
      };
      
      const diffStr = (added === 0 && deleted === 0) ? '-' : `+${formatNumber(added)}/-${formatNumber(deleted)}`;

      const ahead = w.git?.ahead || 0;
      const behind = w.git?.behind || 0;
      let changes = '';
      if (ahead > 0) changes += `${GIT_AHEAD}${ahead} `;
      if (behind > 0) changes += `${GIT_BEHIND}${behind}`;
      if (!changes) changes = '-'; // No commits ahead/behind base branch
      
      // PUSHED column: show push status to remote
      let pushed = '';
      if (w.git?.has_remote) {
        if (w.git.ahead === 0 && !w.git.has_changes) {
          pushed = '✓'; // All changes are pushed
        } else {
          pushed = '↗'; // Has unpushed commits or changes
        }
      } else {
        pushed = '-'; // No remote configured
      }

      const pr = w.pr;
      let prStr = '';
      if (pr?.number) {
        const badge = pr.has_conflicts ? '⚠️' : (pr.is_merged || pr.state === 'MERGED') ? '⟫' : pr.checks === 'passing' ? '✓' : pr?.checks === 'failing' ? '✗' : pr?.checks === 'pending' ? '⏳' : '';
        prStr = `#${pr.number}${badge}`;
      } else if (pr !== undefined) {
        prStr = '-'; // PR data loaded, no PR exists
      } else {
        prStr = ''; // PR data still loading
      }

      // =============================================================================
      // CELL HIGHLIGHTING LOGIC
      // =============================================================================
      // Only one cell is highlighted per row, in priority order (highest priority wins)
      // Column indices: [0=num, 1=project/feature, 2=ai, 3=diff, 4=changes, 5=pr]
      // 
      // IMPORTANT: This calculation runs on every render, so priorities automatically
      // recalculate when PR data, git status, or Claude status changes.
      
      const COLUMNS = {
        NUMBER: 0,
        PROJECT_FEATURE: 1, 
        AI: 2,
        DIFF: 3,
        CHANGES: 4,
        PUSHED: 5,
        PR: 6
      };
      
      const COLORS = {
        YELLOW: 'yellow',  // Attention needed
        RED: 'red',        // Urgent action needed  
        GREEN: 'green'     // Ready/good state
      };
      
      // Check if this row should be dimmed (merged PRs)
      // Handle both PRStatus instances and plain objects
      const isDimmed = pr?.is_merged === true || pr?.state === 'MERGED';
      
      let highlightIndex = -1;
      let highlightColor: any = undefined;
      
      // Skip all highlighting if agent is working or thinking, or if PR is merged (dimmed)
      if (cs.includes('working') || cs.includes('thinking') || isDimmed) {
        // Agent is busy or PR is merged - nothing is actionable, so no highlighting
      }
      // PRIORITY 1: Claude waiting for input (highest priority - blocks all work)
      else if (cs.includes('waiting')) {
        highlightIndex = COLUMNS.AI;
        highlightColor = COLORS.YELLOW;
        // claude-waiting
      }
      // PRIORITY 2: Unstaged changes (need to commit before doing anything else)
      else if (w.git?.has_changes) {
        highlightIndex = COLUMNS.DIFF;
        highlightColor = COLORS.YELLOW;
        // unstaged-changes';
      }
      // PRIORITY 3: Unpushed commits (commits ready to push/sync)
      else if ((w.git?.ahead || 0) > 0) {
        highlightIndex = COLUMNS.PUSHED;
        highlightColor = COLORS.YELLOW;
        // unpushed-commits';
      }
      // PRIORITY 4+: PR-related priorities (only if PR status has been loaded)
      else if (pr !== undefined) {
        // PRIORITY 4: PR has merge conflicts (highest PR priority)
        if (pr.has_conflicts) {
          highlightIndex = COLUMNS.PR;
          highlightColor = COLORS.RED;
          // pr-conflicts';
        }
        // PRIORITY 5: PR needs attention (failing checks, etc.)
        else if (pr.checks === 'failing') {
          highlightIndex = COLUMNS.PR;
          highlightColor = COLORS.RED;
          // pr-needs-attention';
        }
        // PRIORITY 6: PR ready to merge (positive action available)
        else if (pr.is_ready_to_merge) {
          highlightIndex = COLUMNS.PR;
          highlightColor = COLORS.GREEN;
          // pr-ready-to-merge';
        }
        // PRIORITY 7: PR exists but no urgent action (informational)
        else if (pr.is_open && pr.number) {
          highlightIndex = COLUMNS.PR;
          highlightColor = COLORS.YELLOW;
          // pr-informational';
        }
        // PRIORITY 7.5: PR successfully merged (completed work)
        else if (pr.is_merged && pr.number) {
          highlightIndex = COLUMNS.PR;
          highlightColor = COLORS.GREEN;
          // pr-merged';
        }
        // PRIORITY 8: Claude idle - ready for work (when nothing else needs attention)
        else if (w.session?.attached && (cs.includes('idle') || cs.includes('active'))) {
          highlightIndex = COLUMNS.AI;
          highlightColor = COLORS.GREEN;
          // claude-ready';
        }
      }
      // PR status not loaded yet - be conservative, don't highlight Claude as ready
      // NO HIGHLIGHT: No session or everything is clean and pushed (priorityReason stays 'none')

      const bg = selected ? 'blue' : undefined;
      const common = {backgroundColor: bg, bold: selected} as any;
      const cells: Array<{text: string; color?: any}> = [
        {text: num, color: isDimmed ? 'gray' : undefined},
        {text: pf, color: isDimmed ? 'gray' : undefined},
        {text: ai, color: isDimmed ? 'gray' : undefined},
        {text: diffStr, color: isDimmed ? 'gray' : undefined},
        {text: changes, color: isDimmed ? 'gray' : undefined},
        {text: pushed, color: isDimmed ? 'gray' : undefined},
        {text: prStr, color: isDimmed ? 'gray' : undefined}
      ];
      if (highlightIndex >= 0 && !isDimmed) cells[highlightIndex].color = highlightColor;

      // Use auto-calculated column widths for perfect grid alignment
      return h(
        Box,
        {key: `${w.project}/${w.feature}`},
        h(Box, {width: columnWidths[0], marginRight: 1}, h(Text, {...common, color: cells[0].color}, cells[0].text.trim())),
        h(Box, {width: columnWidths[1], marginRight: 1}, h(Text, {...common, color: cells[1].color}, cells[1].text.trim())),
        h(Box, {width: columnWidths[2], justifyContent: 'center', marginRight: 1}, h(Text, {...common, color: cells[2].color}, cells[2].text.trim())),
        h(Box, {width: columnWidths[3], justifyContent: 'flex-end', marginRight: 1}, h(Text, {...common, color: cells[3].color}, cells[3].text.trim())),
        h(Box, {width: columnWidths[4], justifyContent: 'flex-end', marginRight: 1}, h(Text, {...common, color: cells[4].color}, cells[4].text.trim())),
        h(Box, {width: columnWidths[5], justifyContent: 'center', marginRight: 1}, h(Text, {...common, color: cells[5].color}, cells[5].text.trim())),
        h(Box, {width: columnWidths[6]}, h(Text, {...common, color: cells[6].color}, cells[6].text.trim()))
      );
    });
  }, [worktrees, selectedIndex, page, pageSize, columnWidths]);

  if (mode === 'message') {
    return h(
      Box,
      {flexDirection: 'column'},
      h(Text, {color: 'yellow'}, message || '')
    );
  }

  if (mode === 'prompt') {
    return h(
      Box,
      {flexDirection: 'column'},
      h(Text, {color: 'cyan'}, prompt?.title || ''),
      h(Text, null, prompt?.text || ''),
      h(Text, {color: 'gray'}, prompt?.hint || '')
    );
  }

  if (!worktrees.length) {
    return h(
      Box,
      {flexDirection: 'column'},
      h(Text, {color: 'yellow'}, 'No worktrees found.'),
      h(Text, null, 'Ensure your projects live under ~/projects and have worktrees in -branches folders.'),
      h(Text, null, 'Press q to quit.')
    );
  }

  const totalPages = Math.max(1, Math.ceil(worktrees.length / pageSize));
  
  const header = h(
    Box,
    {marginBottom: 0},
    h(Box, {width: columnWidths[0], marginRight: 1}, h(Text, {color: 'gray', bold: true}, '#')),
    h(Box, {width: columnWidths[1], marginRight: 1}, h(Text, {color: 'gray', bold: true}, 'PROJECT/FEATURE')),
    h(Box, {width: columnWidths[2], justifyContent: 'center', marginRight: 1}, h(Text, {color: 'gray', bold: true}, 'AI')),
    h(Box, {width: columnWidths[3], justifyContent: 'flex-end', marginRight: 1}, h(Text, {color: 'gray', bold: true}, 'DIFF')),
    h(Box, {width: columnWidths[4], justifyContent: 'flex-end', marginRight: 1}, h(Text, {color: 'gray', bold: true}, 'CHANGES')),
    h(Box, {width: columnWidths[5], justifyContent: 'center', marginRight: 1}, h(Text, {color: 'gray', bold: true}, 'PUSHED')),
    h(Box, {width: columnWidths[6]}, h(Text, {color: 'gray', bold: true}, 'PR'))
  );
  
  return h(
    Box,
    {flexDirection: 'column'},
    h(
      Box,
      {marginBottom: 1},
      h(Text, {color: 'magenta'}, `Tmux Session Manager — j/k navigate, Enter attach, n new, a archive, s shell, d diff, D uncommitted, r refresh, v archived, ? help, q quit  [${page + 1}/${totalPages}]`)
    ),
    header,
    ...rows
  );
}
