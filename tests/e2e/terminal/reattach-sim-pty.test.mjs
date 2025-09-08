import {test} from 'node:test';
import assert from 'node:assert/strict';

// This test runs the app inside a real tmux pane (true TTY)
// It uses E2E_SIMULATE_TMUX_ATTACH so attach/detach returns immediately
// and then verifies that the screen re-renders after each cycle.

async function sh(cmd) {
  const {exec} = await import('node:child_process');
  return await new Promise((resolve, reject) => {
    exec(cmd, {env: process.env, timeout: 15000}, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.toString());
    });
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

test('reattach cycles in real TTY (tmux) keep rendering', async () => {
  const sess = 'devteam-reattach-sim';
  try { await sh(`tmux kill-session -t ${sess}`); } catch {}

  // Start the runner inside tmux with necessary env
  const env = 'E2E_SIMULATE_TMUX_ATTACH=1 E2E_IGNORE_RAWMODE=0';
  await sh(`tmux new-session -ds ${sess} '${env} node tests/e2e/terminal/runner-reattach-sim.mjs'`);

  // Give it time to boot
  await delay(400);

  // Expect initial list
  let out = await sh(`tmux capture-pane -p -t ${sess}`);
  assert.ok(out.includes('demo/feature-1'), 'initial list visible');

  // Press Enter (select) -> tmux hint, then press 'c' to continue (attach)
  for (let i = 0; i < 5; i++) {
    await sh(`tmux send-keys -t ${sess} Enter`);
    await delay(200);
    out = await sh(`tmux capture-pane -p -t ${sess}`);
    assert.ok(out.includes('tmux'), 'tmux hint visible before attach');
    await sh(`tmux send-keys -t ${sess} c`);
    await delay(400);
    out = await sh(`tmux capture-pane -p -t ${sess}`);
    assert.ok(out.includes('demo/feature-1'), `list visible after detach, cycle ${i+1}`);
  }

  try { await sh(`tmux kill-session -t ${sess}`); } catch {}
});

