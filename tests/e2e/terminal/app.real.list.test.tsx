import React from 'react';
import {memoryStore, setupTestProject, setupTestWorktree, setupTestGitStatus, setupTestPRStatus} from '../../fakes/stores.js';
import {renderTestApp} from '../../utils/renderApp.js';

test('real render shows seeded worktrees (no fake rendering)', async () => {
  // Using mock renderer for deterministic output (<1s)
  // Minimal waitFor that works in node (no JSDOM required)
  const waitFor = async (fn: () => void, opts: {timeout?: number; interval?: number} = {}) => {
    const timeout = opts.timeout ?? 1000;
    const interval = opts.interval ?? 50;
    const start = Date.now();
    let lastError: any;
    while (Date.now() - start <= timeout) {
      try {
        fn();
        return;
      } catch (err) {
        lastError = err;
        await new Promise(r => setTimeout(r, interval));
      }
    }
    throw lastError || new Error('waitFor timeout');
  };
  // Install fake services via global factories consumed by contexts
  // No need to inject globals when using mock renderer

  // Seed in-memory store
  memoryStore.reset();
  setupTestProject('demo');
  const wt1 = setupTestWorktree('demo', 'feature-1');
  setupTestGitStatus(wt1.path, {ahead: 1, base_added_lines: 5});
  setupTestPRStatus(wt1.path, {number: 123, state: 'OPEN', checks: 'passing'});
  setupTestWorktree('demo', 'feature-2');

  // Render App with mock output driver
  const {lastFrame, unmount} = renderTestApp();

  // Wait quickly for the seeded rows to appear (no input nudges)
  await waitFor(() => {
    const frame = lastFrame() || '';
    expect(frame).toContain('demo/feature-1');
    expect(frame).toContain('demo/feature-2');
  }, {timeout: 800, interval: 50});

  unmount();
}, 5000);
