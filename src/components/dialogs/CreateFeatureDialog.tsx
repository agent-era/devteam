import React, {useCallback, useEffect, useMemo, useState, useRef} from 'react';
import {Box, Text, measureElement, useInput, useStdin} from 'ink';
import {useMouseRegion} from '../../contexts/MouseContext.js';
import {useListMouseHandler} from '../../hooks/useListMouseHandler.js';
import {useTerminalDimensions} from '../../hooks/useTerminalDimensions.js';
import AnnotatedText from '../common/AnnotatedText.js';
import type {ProjectInfo} from '../../models.js';
import {kebabCase, truncateText} from '../../shared/utils/formatting.js';
import {validateFeatureName} from '../../shared/utils/validation.js';
import {TextInput} from '@inkjs/ui';
import {useInputFocus} from '../../contexts/InputFocusContext.js';

type Props = {
  projects: ProjectInfo[];
  defaultProject?: string;
  // Updated: support selecting multiple projects
  onSubmit: (projects: string[], feature: string) => Promise<void> | void;
  onCancel: () => void;
};

const CreateFeatureDialog = React.memo(function CreateFeatureDialog({projects, defaultProject, onSubmit, onCancel}: Props) {
  const [mode, setMode] = useState<'select'|'input'|'creating'>('select');
  const [filter, setFilter] = useState('');
  const [cursor, setCursor] = useState(() => Math.max(0, projects.findIndex(p => p.name === defaultProject)));
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => {
    const s = new Set<number>();
    const idx = Math.max(0, projects.findIndex(p => p.name === defaultProject));
    if (projects.length > 0) s.add(idx);
    return s;
  });
  const [featureName, setFeatureName] = useState('');
  const featureInputRef = useRef(null);
  const {requestFocus, releaseFocus} = useInputFocus();
  const {rows, columns} = useTerminalDimensions();

  // Mouse coordinate tracking for the select-mode project list
  const dialogRef = useRef<any>(null);
  const headerRef = useRef<any>(null);
  const [dialogHeight, setDialogHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    requestFocus('create-feature-dialog');
    return () => releaseFocus('create-feature-dialog');
  }, [requestFocus, releaseFocus]);

  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(f));
  }, [projects, filter]);
  const showFilter = (projects?.length || 0) > 3;
  const visibleFiltered = filtered.slice(0, 20);

  useEffect(() => {
    if (mode !== 'select') return;
    const measure = () => {
      if (dialogRef.current) setDialogHeight(measureElement(dialogRef.current).height);
      if (headerRef.current) setHeaderHeight(measureElement(headerRef.current).height);
    };
    measure();
    const t = setTimeout(measure, 0);
    return () => clearTimeout(t);
  }, [mode, rows, columns, visibleFiltered.length, showFilter]);

  const dialogTopY = 1 + Math.floor(Math.max(0, (rows - 1 - dialogHeight) / 2));
  const itemsStartY = dialogTopY + headerHeight;

  const handleItemMouseDown = useListMouseHandler({
    length: visibleFiltered.length,
    onSelect: (idx) => { if (mode === 'select') setCursor(idx); },
    onActivate: (idx) => {
      if (mode !== 'select') return;
      const projectName = visibleFiltered[idx]?.name;
      if (!projectName) return;
      const globalIdx = Math.max(0, projects.findIndex(p => p.name === projectName));
      setSelectedIndices(new Set([globalIdx]));
      setCursor(idx);
      setMode('input');
    },
  });

  const handleScrollInList = useCallback((direction: 'up' | 'down') => {
    if (mode !== 'select') return;
    setCursor(s => direction === 'up'
      ? Math.max(0, s - 1)
      : Math.min(visibleFiltered.length - 1, s + 1));
  }, [mode, visibleFiltered.length]);

  useMouseRegion('create-feature', itemsStartY, visibleFiltered.length, handleItemMouseDown, handleScrollInList);

  useInput((input, key) => {
    if (mode === 'creating') return; // Disable input during creation
    if (key.escape) {
      if (mode === 'input') setMode('select');
      else onCancel();
      return;
    }
    if (mode === 'select') {
      // Handle control keys first
      if (key.return) {
        // Move to feature name input when at least one selected
        if (selectedIndices.size === 0 && filtered.length > 0) {
          const idx = Math.min(cursor, filtered.length - 1);
          const globalIdx = Math.max(0, projects.findIndex(p => p.name === filtered[idx].name));
          const s = new Set<number>([globalIdx]);
          setSelectedIndices(s);
        }
        setMode('input');
        return;
      }
      if (input === ' ') {
        // Toggle current item selection
        const idxInFiltered = Math.min(cursor, filtered.length - 1);
        if (idxInFiltered >= 0) {
          const projectName = filtered[idxInFiltered].name;
          const globalIdx = Math.max(0, projects.findIndex(p => p.name === projectName));
          const next = new Set(selectedIndices);
          if (next.has(globalIdx)) next.delete(globalIdx); else next.add(globalIdx);
          setSelectedIndices(next);
        }
        return;
      }
      
      // Navigation keys
      if (key.downArrow) {
        setCursor(s => Math.min(filtered.length - 1, s + 1));
        return;
      }
      if (key.upArrow) {
        setCursor(s => Math.max(0, s - 1));
        return;
      }
      
      // Number keys for quick selection
      if (/^[0-9]$/.test(input)) {
        const idx = Number(input) - 1;
        if (idx >= 0 && idx < filtered.length) setCursor(idx);
        return;
      }
      
      // Text filtering — only when filter UI is shown
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
    }
  });

  const handleFeatureNameSubmit = (value: string) => {
    const feat = kebabCase(value);
    if (!validateFeatureName(feat)) return;
    // Build selected project list from indices
    const names: string[] = [];
    if (selectedIndices.size === 0) {
      const p = filtered[Math.min(cursor, filtered.length - 1)]?.name || projects[0]?.name;
      if (p) names.push(p);
    } else {
      [...selectedIndices].sort((a, b) => a - b).forEach(i => {
        const proj = projects[i]?.name;
        if (proj) names.push(proj);
      });
    }
    if (names.length === 0) return;
    setMode('creating');
    Promise.resolve(onSubmit(names, feat)).catch((err) => {
      // If creation fails, go back to input mode and log the error for debugging
      try {
        const {logError} = require('../../shared/utils/logger.js');
        logError('CreateFeatureDialog: failed to create feature', { error: err instanceof Error ? err.message : String(err) });
      } catch {}
      setMode('input');
    });
  };

  const handleFeatureNameChange = (value: string) => {
    setFeatureName(value);
  };

  if (mode === 'creating') {
    return (
      <Box flexDirection="column" alignItems="center">
        <Text color="cyan">Creating feature branch...</Text>
        <Text color="yellow">{`${featureName}`}</Text>
        <Text color="gray">Setting up worktree and tmux session...</Text>
      </Box>
    );
  }

  if (mode === 'select') {
    return (
      <Box ref={dialogRef} flexDirection="column">
        <Box ref={headerRef} flexDirection="column">
          <Text color="cyan">Create Feature — Select Projects</Text>
          <Text color="gray">[space] select multiple, [enter] continue</Text>
          {showFilter && (
            <Box flexDirection="row">
              <Text color="gray">Filter: </Text>
              <Text>{filter || ' '}</Text>
            </Box>
          )}
        </Box>
        {visibleFiltered.map((p, i) => {
          const projectIsSelected = selectedIndices.has(Math.max(0, projects.findIndex(pp => pp.name === p.name)));
          const isCursor = i === cursor;
          const prefix = isCursor ? '› ' : '  ';
          const marker = projectIsSelected ? '[x] ' : '[ ] ';
          return (
            <Text key={p.name} color={isCursor ? 'green' : undefined}>
              {`${prefix}${marker}${p.name}`}
            </Text>
          );
        })}
        <Box marginTop={1}>
          <AnnotatedText color="magenta" wrap="truncate" text={`${showFilter ? 'Type to filter, ' : ''}[space] multi-select, [1]–[9] quick move, [enter] continue, [esc] cancel`} />
        </Box>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text color="cyan">Create Feature — Feature Name</Text>
      <Text>Enter feature name (kebab-case suggested), ESC back</Text>
      <TextInput
        placeholder=" "
        onSubmit={handleFeatureNameSubmit}
        onChange={handleFeatureNameChange}
      />
    </Box>
  );
});

export default CreateFeatureDialog;
