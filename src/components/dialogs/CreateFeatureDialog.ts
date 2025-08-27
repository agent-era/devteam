import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;
import type {ProjectInfo} from '../../models.js';
import {kebabCase, validateFeatureName, truncateText} from '../../utils.js';

type Props = {
  projects: ProjectInfo[];
  defaultProject?: string;
  onSubmit: (project: string, feature: string) => Promise<void> | void;
  onCancel: () => void;
};

export default function CreateFeatureDialog({projects, defaultProject, onSubmit, onCancel}: Props) {
  const [mode, setMode] = useState<'select'|'input'|'creating'>('select');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(() => Math.max(0, projects.findIndex(p => p.name === defaultProject)));
  const [feature, setFeature] = useState('');
  const {isRawModeSupported} = useStdin();

  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(f));
  }, [projects, filter]);

  useInput((input, key) => {
    if (!isRawModeSupported) return;
    if (mode === 'creating') return; // Disable input during creation
    if (key.escape) {
      if (mode === 'input') setMode('select');
      else onCancel();
      return;
    }
    if (mode === 'select') {
      if (key.downArrow || input === 'j') setSelected(s => Math.min(filtered.length - 1, s + 1));
      else if (key.upArrow || input === 'k') setSelected(s => Math.max(0, s - 1));
      else if (/^[0-9]$/.test(input)) {
        const idx = Number(input) - 1;
        if (idx >= 0 && idx < filtered.length) setSelected(idx);
      } else if (key.return) {
        setMode('input');
      } else if (input && !key.ctrl && !key.meta) {
        setFilter(prev => prev + input);
      } else if (key.backspace) {
        setFilter(prev => prev.slice(0, -1));
      }
    } else {
      // input mode for feature name
      if (key.return) {
        const proj = filtered[selected]?.name || projects[0]?.name;
        const feat = kebabCase(feature);
        if (proj && validateFeatureName(feat)) {
          setMode('creating');
          Promise.resolve(onSubmit(proj, feat)).catch(() => {
            // If creation fails, go back to input mode
            setMode('input');
          });
        }
        return;
      }
      if (key.backspace) setFeature(prev => prev.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setFeature(prev => prev + input);
    }
  });

  if (mode === 'creating') {
    return h(
      Box, {flexDirection: 'column', alignItems: 'center'},
      h(Text, {color: 'cyan'}, 'Creating feature branch...'),
      h(Text, {color: 'yellow'}, `${filtered[selected]?.name || ''}/${feature}`),
      h(Text, {color: 'gray'}, 'Setting up worktree and tmux session...')
    );
  }

  if (mode === 'select') {
    return h(
      Box, {flexDirection: 'column'},
      h(Text, {color: 'cyan'}, 'Create Feature — Select Project'),
      h(Text, {color: 'gray'}, 'Type to filter, arrows or j/k to move, Enter select, ESC cancel'),
      ...filtered.slice(0, 20).map((p, i) => h(Text, {key: p.name, color: i === selected ? 'green' : undefined}, `${i === selected ? '› ' : '  '}${p.name}`))
    );
  }
  return h(
    Box, {flexDirection: 'column'},
    h(Text, {color: 'cyan'}, `Create Feature — ${filtered[selected]?.name || ''}`),
    h(Text, null, 'Enter feature name (kebab-case suggested), ESC back'),
    h(Text, {color: 'yellow'}, feature || ' ')
  );
}

