import {describe, expect, test} from '@jest/globals';
import {bottomActionHit, compactModeState, computeLayout, modeStatusSummary, renderActionLabel, tileHitTarget} from '../../src/TmuxNavigatorApp.js';

describe('TmuxNavigatorApp layout helpers', () => {
  const item = {
    sessions: {
      agent: {exists: true, usable: true},
      shell: {exists: true, usable: false},
      run: {exists: false, usable: false},
    },
  } as any;

  test('uses up to six visible tiles with three-line rows', () => {
    const layout = computeLayout(120, 11, 12, 5);
    expect(layout.tileColumns).toBe(3);
    expect(layout.tileRows).toBe(2);
    expect(layout.visibleCount).toBe(6);
    expect(layout.pageStart).toBe(0);
  });

  test('maps tile clicks across three-line tile rows', () => {
    const layout = computeLayout(120, 11, 12, 0);
    expect(tileHitTarget(2, 1, layout)).toBe(0);
    expect(tileHitTarget(layout.tileWidth + 2, 2, layout)).toBe(1);
    expect(tileHitTarget(2, 4, layout)).toBe(3);
    expect(tileHitTarget(2, 8, layout)).toBeNull();
  });

  test('maps bottom action clicks using rendered label widths', () => {
    const layout = computeLayout(120, 11, 12, 0);
    const actionY = layout.tileRows * 3 + 2;
    const agentLabel = renderActionLabel('agent', item.sessions.agent, true);
    const shellLabel = renderActionLabel('shell', item.sessions.shell, false);
    const runLabel = renderActionLabel('run', item.sessions.run, false);
    const closeX = agentLabel.length + shellLabel.length + runLabel.length + 4;
    const backX = closeX + ' Close '.length + 1;

    expect(bottomActionHit(2, actionY, 120, layout, item, 'agent')).toBe('agent');
    expect(bottomActionHit(closeX, actionY, 120, layout, item, 'agent')).toBe('close');
    expect(bottomActionHit(backX, actionY, 120, layout, item, 'agent')).toBe('back');
  });

  test('summarizes inline mode state compactly', () => {
    expect(compactModeState('agent', item.sessions.agent)).toBe('A');
    expect(compactModeState('shell', item.sessions.shell)).toBe('!');
    expect(compactModeState('run', item.sessions.run)).toBe('-');
    expect(modeStatusSummary(item)).toBe('AA S! R-');
  });
});
