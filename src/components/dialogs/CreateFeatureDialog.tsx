import React, {useEffect, useMemo, useState, useRef} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
import AnnotatedText from '../common/AnnotatedText.js';
import type {ProjectInfo} from '../../models.js';
import {kebabCase, truncateText} from '../../shared/utils/formatting.js';
import {validateFeatureName} from '../../shared/utils/validation.js';
import {TextInput} from '@inkjs/ui';
import {useInputFocus} from '../../contexts/InputFocusContext.js';

type Props = {
  projects: ProjectInfo[];
  defaultProject?: string;
  onSubmit: (project: string, feature: string) => Promise<void> | void;
  onCancel: () => void;
};

const CreateFeatureDialog = React.memo(function CreateFeatureDialog({projects, defaultProject, onSubmit, onCancel}: Props) {
  const [mode, setMode] = useState<'select'|'input'|'creating'>('select');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(() => Math.max(0, projects.findIndex(p => p.name === defaultProject)));
  const [featureName, setFeatureName] = useState('');
  const featureInputRef = useRef(null);
  const {requestFocus, releaseFocus} = useInputFocus();

  useEffect(() => {
    requestFocus('create-feature-dialog');
    return () => releaseFocus('create-feature-dialog');
  }, [requestFocus, releaseFocus]);

  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(f));
  }, [projects, filter]);

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
        setMode('input');
        return;
      }
      
      // Navigation keys
      if (key.downArrow || input === 'j') {
        setSelected(s => Math.min(filtered.length - 1, s + 1));
        return;
      }
      if (key.upArrow || input === 'k') {
        setSelected(s => Math.max(0, s - 1));
        return;
      }
      
      // Number keys for quick selection
      if (/^[0-9]$/.test(input)) {
        const idx = Number(input) - 1;
        if (idx >= 0 && idx < filtered.length) setSelected(idx);
        return;
      }
      
      // Text filtering - check both keys due to terminal key mapping inconsistencies
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

  const handleFeatureNameSubmit = (value: string) => {
    const proj = filtered[selected]?.name || projects[0]?.name;
    const feat = kebabCase(value);
    if (proj && validateFeatureName(feat)) {
      setMode('creating');
      Promise.resolve(onSubmit(proj, feat)).catch(() => {
        // If creation fails, go back to input mode
        setMode('input');
      });
    }
  };

  const handleFeatureNameChange = (value: string) => {
    setFeatureName(value);
  };

  if (mode === 'creating') {
    return (
      <Box flexDirection="column" alignItems="center">
        <Text color="cyan">Creating feature branch...</Text>
        <Text color="yellow">{`${filtered[selected]?.name || ''}/${featureName}`}</Text>
        <Text color="gray">Setting up worktree and tmux session...</Text>
      </Box>
    );
  }

  if (mode === 'select') {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Create Feature — Select Project</Text>
        <AnnotatedText color="magenta" wrap="truncate" text={"Type to filter, [j]/[k] move, [1]–[9] quick select, [enter] select, [esc] cancel"} />
        <Box flexDirection="row">
          <Text color="gray">Filter: </Text>
          <Text>{filter || ' '}</Text>
        </Box>
        {filtered.slice(0, 20).map((p, i) => 
          <Text key={p.name} color={i === selected ? 'green' : undefined}>
            {`${i === selected ? '› ' : '  '}${p.name}`}
          </Text>
        )}
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text color="cyan">Create Feature — {filtered[selected]?.name || ''}</Text>
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
