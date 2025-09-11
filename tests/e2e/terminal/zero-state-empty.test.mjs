import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('MainView shows EmptyState when projects exist but no worktrees', async () => {
  const {render} = await import('../../../node_modules/ink-testing-library/build/index.js');
  const MainView = (await import('../../../dist/components/views/MainView.js')).default;

  const {lastFrame, unmount} = render(
    React.createElement(MainView, {
      worktrees: [],
      selectedIndex: 0,
      page: 0,
      hasProjects: true,
    })
  );

  await new Promise(r => setTimeout(r, 100));
  const {stripAnsi} = await import('./_utils.js');
  const raw = lastFrame?.() || '';
  const frame = stripAnsi(raw);
  assert.ok(frame.includes('Welcome to DevTeam'), 'Expected EmptyState welcome text');
  assert.ok(frame.includes('Press [n] to create a new branch'), 'Expected create-branch hint');
  assert.ok(frame.includes('Press [q] to quit'), 'Expected quit hint');
  try { unmount?.(); } catch {}
});
