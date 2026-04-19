import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, measureElement, useInput, useStdin} from 'ink';
import AnnotatedText from '../common/AnnotatedText.js';
import type {ProjectInfo} from '../../models.js';
import {useMouseRegion} from '../../contexts/MouseContext.js';
import {useListMouseHandler} from '../../hooks/useListMouseHandler.js';
import {useTerminalDimensions} from '../../hooks/useTerminalDimensions.js';

type Props = {
  projects: ProjectInfo[];
  defaultProject?: string;
  onSubmit: (project: string) => void;
  onCancel: () => void;
};

export default function ProjectPickerDialog({projects, defaultProject, onSubmit, onCancel}: Props) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(() => {
    if (!projects || projects.length === 0) return 0;
    return Math.max(0, projects.findIndex(p => p.name === defaultProject));
  });
  const {rows, columns} = useTerminalDimensions();
  const filtered = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    const f = filter.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(f));
  }, [projects, filter]);
  const showFilter = (projects?.length || 0) > 3;
  const visibleItems = filtered.slice(0, 20);

  // Mouse coordinate tracking
  const dialogRef = useRef<any>(null);
  const headerRef = useRef<any>(null);
  const [dialogHeight, setDialogHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const measure = () => {
      if (dialogRef.current) setDialogHeight(measureElement(dialogRef.current).height);
      if (headerRef.current) setHeaderHeight(measureElement(headerRef.current).height);
    };
    measure();
    const t = setTimeout(measure, 0);
    return () => clearTimeout(t);
  }, [rows, columns, visibleItems.length, showFilter]);

  const dialogTopY = 1 + Math.floor(Math.max(0, (rows - 1 - dialogHeight) / 2));
  const itemsStartY = dialogTopY + headerHeight;

  const handleItemMouseDown = useListMouseHandler({
    length: visibleItems.length,
    onSelect: (idx) => setSelected(idx),
    onActivate: (idx) => { const proj = visibleItems[idx]?.name; if (proj) onSubmit(proj); },
  });

  const handleScroll = useCallback((direction: 'up' | 'down') => {
    setSelected(s => direction === 'up'
      ? Math.max(0, s - 1)
      : Math.min(visibleItems.length - 1, s + 1));
  }, [visibleItems.length]);

  useMouseRegion('project-picker', itemsStartY, visibleItems.length, handleItemMouseDown, handleScroll);

  useInput((input, key) => {
    if (key.escape) return onCancel();
    
    // Handle control keys first before text input
    if (key.return) {
      const proj = filtered[selected]?.name || (projects && projects[0]?.name);
      if (proj) onSubmit(proj);
      return;
    }
    
    // Navigation keys
    if (key.downArrow) {
      setSelected((s) => Math.min(filtered.length - 1, s + 1));
      return;
    }
    if (key.upArrow) {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    
    // Number keys for quick selection
    if (/^[1-9]$/.test(input)) {
      const idx = Number(input) - 1;
      if (idx >= 0 && idx < filtered.length) setSelected(idx);
      return;
    }
    
    // Text filtering - only when filter UI is shown
    if (showFilter) {
      if (key.backspace || key.delete) {
        setFilter((f) => f.slice(0, -1));
        return;
      }
      
      // Regular typing
      if (input && !key.ctrl && !key.meta) {
        setFilter((f) => f + input);
        return;
      }
    }
  });

  return (
    <Box ref={dialogRef} flexDirection="column">
      <Box ref={headerRef} flexDirection="column">
        <Text color="cyan">Select Project</Text>
        {showFilter && (
          <Box flexDirection="row">
            <Text color="gray">Filter: </Text>
            <Text>{filter || ' '}</Text>
          </Box>
        )}
      </Box>
      {visibleItems.map((p, i) =>
        <Text key={p.name} color={i === selected ? 'green' : undefined}>
          {`${i === selected ? '› ' : '  '}${p.name}`}
        </Text>
      )}
      <Box marginTop={1}>
        <AnnotatedText color="magenta" wrap="truncate" text={`${showFilter ? 'Type to filter, ' : ''}[1]–[9] quick select, [enter] select, [esc] cancel`} />
      </Box>
    </Box>
  );
}
