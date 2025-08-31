import React, {useMemo} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;

type ArchivedItem = {
  project: string;
  feature: string;
  path: string;
  branch: string;
  archived_date?: string;
  is_archived: boolean;
  mtime: number;
};

type Props = {
  items: ArchivedItem[];
  selectedIndex: number;
  onMove?: (delta: number) => void;
  onDelete?: (index: number) => void;
  onUnarchive?: (index: number) => void;
  onBack?: () => void;
};

export default function ArchivedView({items, selectedIndex, onMove, onDelete, onUnarchive, onBack}: Props) {
  useInput((input, key) => {
    if (key.escape || input === 'v') onBack?.();
    if (input === 'j' || key.downArrow) onMove?.(1);
    if (input === 'k' || key.upArrow) onMove?.(-1);
    if (input === 'd') onDelete?.(selectedIndex);
    if (input === 'u') onUnarchive?.(selectedIndex);
  });

  const rows = useMemo(() => items.map((it, i) => {
    const sel = i === selectedIndex;
    const prefix = sel ? '›' : ' ';
    const date = it.archived_date ? ` (${it.archived_date})` : '';
    return h(
      Box,
      {key: it.path},
      h(Text, {color: sel ? 'green' : undefined}, prefix),
      h(Text, null, ` ${it.project}/${it.feature}`),
      h(Text, {color: 'gray'}, date)
    );
  }), [items, selectedIndex]);

  return h(
    Box,
    {flexDirection: 'column'},
    h(Box, {marginBottom: 1}, h(Text, {color: 'magenta'}, 'Archived — j/k navigate, u unarchive, d delete, v back')),
    ...rows
  );
}

