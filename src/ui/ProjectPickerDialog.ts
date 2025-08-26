import React, {useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;
import type {ProjectInfo} from '../models.js';

type Props = {
  projects: ProjectInfo[];
  defaultProject?: string;
  onSubmit: (project: string) => void;
  onCancel: () => void;
};

export default function ProjectPickerDialog({projects, defaultProject, onSubmit, onCancel}: Props) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(() => Math.max(0, projects.findIndex(p => p.name === defaultProject)));
  const {isRawModeSupported} = useStdin();
  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(f));
  }, [projects, filter]);

  useInput((input, key) => {
    if (!isRawModeSupported) return;
    if (key.escape) return onCancel();
    if (key.downArrow || input === 'j') setSelected((s) => Math.min(filtered.length - 1, s + 1));
    else if (key.upArrow || input === 'k') setSelected((s) => Math.max(0, s - 1));
    else if (/^[1-9]$/.test(input)) {
      const idx = Number(input) - 1;
      if (idx >= 0 && idx < filtered.length) setSelected(idx);
    } else if (key.return) {
      const proj = filtered[selected]?.name || projects[0]?.name;
      if (proj) onSubmit(proj);
    } else if (key.backspace) setFilter((f) => f.slice(0, -1));
    else if (input && !key.ctrl && !key.meta) setFilter((f) => f + input);
  });

  return h(
    Box, {flexDirection: 'column'},
    h(Text, {color: 'cyan'}, 'Select Project'),
    h(Text, {color: 'gray'}, 'Type to filter, j/k arrows to move, 1-9 jump, Enter select, ESC cancel'),
    ...filtered.slice(0, 20).map((p, i) => h(Text, {key: p.name, color: i === selected ? 'green' : undefined}, `${i === selected ? '› ' : '  '}${p.name}`))
  );
}

