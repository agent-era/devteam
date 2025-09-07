import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('ink smoke renders text', async () => {
  const {render} = await import('../../../node_modules/ink-testing-library/build/index.js');
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {lastFrame, unmount} = render(React.createElement(Ink.Text, null, 'Hello Ink'));
  await new Promise(r => setTimeout(r, 100));
  const frame = lastFrame?.() || '';
  assert.ok(frame.includes('Hello Ink'), `Expected frame to include text, got: ${JSON.stringify(frame)}`);
  try { unmount?.(); } catch {}
});

