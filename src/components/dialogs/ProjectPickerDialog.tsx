import React, {useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import type {ProjectInfo} from '../../models.js';
import {useTextInput} from './TextInput.js';

type Props = {
  projects: ProjectInfo[];
  defaultProject?: string;
  onSubmit: (project: string) => void;
  onCancel: () => void;
};

export default function ProjectPickerDialog({projects, defaultProject, onSubmit, onCancel}: Props) {
  const filterInput = useTextInput();
  const [selected, setSelected] = useState(() => {
    if (!projects || projects.length === 0) return 0;
    return Math.max(0, projects.findIndex(p => p.name === defaultProject));
  });
  const filtered = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    const f = filterInput.value.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(f));
  }, [projects, filterInput.value]);

  useInput((input, key) => {
    if (key.escape) return onCancel();
    
    // Handle control keys first before text input
    if (key.return) {
      const proj = filtered[selected]?.name || (projects && projects[0]?.name);
      if (proj) onSubmit(proj);
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

  return (
    <Box flexDirection="column">
      <Text color="cyan">Select Project</Text>
      <Text color="gray">Type to filter, j/k arrows to move, 1-9 jump, Enter select, ESC cancel</Text>
      <Box flexDirection="row">
        <Text color="gray">Filter: </Text>
        {filterInput.renderText(' ')}
      </Box>
      {filtered.slice(0, 20).map((p, i) => 
        <Text key={p.name} color={i === selected ? 'green' : undefined}>
          {`${i === selected ? '› ' : '  '}${p.name}`}
        </Text>
      )}
    </Box>
  );
}

