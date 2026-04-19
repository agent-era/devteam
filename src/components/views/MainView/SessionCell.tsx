import React from 'react';
import {Text} from 'ink';
import {stringDisplayWidth} from '../../../shared/utils/formatting.js';

const SESSION_ACTIVE_BG = '#005f87';

export function renderSessionCell(key: string, active: boolean, width: number): React.ReactElement {
  if (active) {
    const inner = ` ${key} `;
    const pad = Math.max(0, width - stringDisplayWidth(inner));
    const l = Math.floor(pad / 2);
    const r = pad - l;
    return <Text backgroundColor={SESSION_ACTIVE_BG} color="white" bold>{' '.repeat(l)}{inner}{' '.repeat(r)}</Text>;
  }
  const inner = `[${key}]`;
  const pad = Math.max(0, width - stringDisplayWidth(inner));
  const l = Math.floor(pad / 2);
  const r = pad - l;
  return <Text dimColor>{' '.repeat(l)}{inner}{' '.repeat(r)}</Text>;
}
