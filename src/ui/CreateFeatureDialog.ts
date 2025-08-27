import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useStdin} from 'ink';
const h = React.createElement;
import type {ProjectInfo} from '../models.js';
import {kebabCase, validateFeatureName, truncateText} from '../utils.js';
import {useTextDisplay} from './TextInput.js';

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
  const featureDisplay = useTextDisplay(feature);

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
      // Handle control keys first
      if (key.return) {
        setMode('input');
        // Put cursor at end when entering feature name mode
        featureDisplay.setCursorPosition(feature.length);
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
      
      // Text filtering with simple backspace
      if (key.backspace) {
        setFilter((f) => f.slice(0, -1));
        return;
      }
      
      // Regular typing
      if (input && !key.ctrl && !key.meta) {
        setFilter((f) => f + input);
        return;
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
      
      // Cursor movement for feature input
      if (key.leftArrow) {
        featureDisplay.moveCursor('left');
        return;
      }
      if (key.rightArrow) {
        featureDisplay.moveCursor('right');
        return;
      }
      if (key.ctrl && input === 'a') {
        featureDisplay.moveCursor('home');
        return;
      }
      if (key.ctrl && input === 'e') {
        featureDisplay.moveCursor('end');
        return;
      }
      
      // Handle feature name text input with cursor-aware backspace and typing
      if (key.backspace) {
        const cursorPos = featureDisplay.cursorPos;
        if (cursorPos > 0) {
          const newFeature = feature.slice(0, cursorPos - 1) + feature.slice(cursorPos);
          setFeature(newFeature);
          // Move cursor back one position after deletion
          featureDisplay.setCursorPosition(cursorPos - 1);
        }
        return;
      }
      
      // Delete key (forward delete)
      if (key.delete) {
        const cursorPos = featureDisplay.cursorPos;
        if (cursorPos < feature.length) {
          const newFeature = feature.slice(0, cursorPos) + feature.slice(cursorPos + 1);
          setFeature(newFeature);
          // Keep cursor in same position after forward delete
          featureDisplay.setCursorPosition(cursorPos);
        }
        return;
      }
      
      // Regular typing at cursor position
      if (input && !key.ctrl && !key.meta) {
        const cursorPos = featureDisplay.cursorPos;
        const newFeature = feature.slice(0, cursorPos) + input + feature.slice(cursorPos);
        setFeature(newFeature);
        // Move cursor forward one position after typing
        featureDisplay.setCursorPosition(cursorPos + 1);
        return;
      }
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
      h(Box, {flexDirection: 'row'}, 
        h(Text, {color: 'gray'}, 'Filter: '),
        h(Text, null, filter || ' ')
      ),
      ...filtered.slice(0, 20).map((p, i) => h(Text, {key: p.name, color: i === selected ? 'green' : undefined}, `${i === selected ? '› ' : '  '}${p.name}`))
    );
  }
  return h(
    Box, {flexDirection: 'column'},
    h(Text, {color: 'cyan'}, `Create Feature — ${filtered[selected]?.name || ''}`),
    h(Text, null, 'Enter feature name (kebab-case suggested), ESC back'),
    featureDisplay.renderText(' ', 'yellow')
  );
}

