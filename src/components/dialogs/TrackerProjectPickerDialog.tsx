import React, {useMemo, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {TrackerService} from '../../services/TrackerService.js';
import {useTerminalDimensions} from '../../hooks/useTerminalDimensions.js';
import {WorktreeInfo} from '../../models.js';

type ProjectRow = {
  name: string;
  path: string;
  hasTracker: boolean;
  total: number;
  waiting: number;
  working: number;
};

type Props = {
  projects: Array<{name: string; path: string}>;
  worktrees: WorktreeInfo[];
  currentProjectName: string;
  onSelect: (project: {name: string; path: string}) => void;
  onCancel: () => void;
};

export default function TrackerProjectPickerDialog({
  projects,
  worktrees,
  currentProjectName,
  onSelect,
  onCancel,
}: Props) {
  const service = useMemo(() => new TrackerService(), []);
  const {rows: termRows} = useTerminalDimensions();

  const rows = useMemo<ProjectRow[]>(() => {
    return projects.map(p => {
      const hasTracker = service.hasTracker(p.path);
      const {total} = hasTracker ? service.countItems(p.path) : {total: 0};
      let waiting = 0;
      let working = 0;
      for (const w of worktrees) {
        if (w.project !== p.name) continue;
        const s = w.session?.ai_status;
        if (s === 'waiting') waiting++;
        else if (s === 'working' || s === 'active') working++;
      }
      return {name: p.name, path: p.path, hasTracker, total, waiting, working};
    });
  }, [projects, worktrees, service]);

  const [selected, setSelected] = useState(() => {
    const idx = rows.findIndex(r => r.name === currentProjectName);
    return idx === -1 ? 0 : idx;
  });

  useInput((input, key) => {
    if (key.escape || input === 'q') return onCancel();
    if (key.return) {
      const row = rows[selected];
      if (row) onSelect({name: row.name, path: row.path});
      return;
    }
    if (key.upArrow || input === 'k') { setSelected(s => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === 'j') { setSelected(s => Math.min(rows.length - 1, s + 1)); return; }
    if (input === 'g') { setSelected(0); return; }
    if (input === 'G') { setSelected(rows.length - 1); return; }
    if (/^[1-9]$/.test(input)) {
      const idx = Number(input) - 1;
      if (idx < rows.length) setSelected(idx);
    }
  });

  if (rows.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Switch Tracker</Text>
        <Box marginTop={1}><Text dimColor>No projects with a tracker yet.</Text></Box>
        <Box marginTop={1}><Text color="magenta">[esc] cancel</Text></Box>
      </Box>
    );
  }

  const nameWidth = Math.max(...rows.map(r => r.name.length), 8);

  // Chrome: dialog border (2) + padding (2) + title (1) + marginTop (1) +
  //   marginTop for footer (1) + footer (1) + outer kanban chrome allowance (~4)
  const chrome = 12;
  const visibleRows = Math.max(3, termRows - chrome);
  const total = rows.length;

  // Scroll window — keep selection in view with a couple-row buffer
  let scrollTop = 0;
  if (total > visibleRows) {
    const buffer = Math.min(2, Math.floor(visibleRows / 3));
    if (selected < buffer) scrollTop = 0;
    else if (selected >= total - buffer) scrollTop = total - visibleRows;
    else scrollTop = Math.max(0, selected - Math.floor(visibleRows / 2));
    scrollTop = Math.max(0, Math.min(scrollTop, total - visibleRows));
  }

  const visible = rows.slice(scrollTop, scrollTop + visibleRows);
  const hiddenAbove = scrollTop;
  const hiddenBelow = Math.max(0, total - scrollTop - visibleRows);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">Switch Tracker</Text>
        <Text dimColor>{`${selected + 1} / ${total}`}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {hiddenAbove > 0 && <Text dimColor>{`↑ ${hiddenAbove} more`}</Text>}
        {visible.map((row, i) => {
          const rowIndex = scrollTop + i;
          const isSelected = rowIndex === selected;
          const isCurrent = row.name === currentProjectName;
          const padded = row.name.padEnd(nameWidth);
          const itemsText = row.hasTracker
            ? `${row.total} item${row.total === 1 ? '' : 's'}`
            : '(no tracker yet)';
          return (
            <Box key={row.name}>
              <Text color="gray">{isSelected ? '▸ ' : '  '}</Text>
              <Text
                inverse={isSelected}
                color={isCurrent && !isSelected ? 'cyan' : undefined}
                bold={isCurrent}
                dimColor={!isSelected && !row.hasTracker}
              >
                {padded}
              </Text>
              <Text dimColor>  {itemsText}</Text>
              {row.waiting > 0 && <Text color="yellow" bold>  {` ! ${row.waiting} waiting`}</Text>}
              {row.working > 0 && <Text color="cyan">  {` ⟳ ${row.working} running`}</Text>}
              {isCurrent && <Text dimColor>  (current)</Text>}
            </Box>
          );
        })}
        {hiddenBelow > 0 && <Text dimColor>{`↓ ${hiddenBelow} more`}</Text>}
      </Box>
      <Box marginTop={1}>
        <Text color="magenta">↑/↓ navigate  ·  g/G top/bottom  ·  ↵ select  ·  esc cancel</Text>
      </Box>
    </Box>
  );
}
