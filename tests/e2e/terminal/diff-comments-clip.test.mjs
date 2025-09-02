import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {join} from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// Minimal stdout/stdin stubs to exercise Ink's terminal layout (EventEmitter-based)
import {EventEmitter} from 'node:events';
class CapturingStdout extends EventEmitter {
  constructor(cols = 80, rows = 15) {
    super();
    this.frames = [];
    this._last = '';
    this.isTTY = true;
    this.columns = cols;
    this.rows = rows;
  }
  write(chunk) {
    const s = typeof chunk === 'string' ? chunk : String(chunk);
    this.frames.push(s);
    this._last = s;
    return true;
  }
  lastFrame() {
    return this._last;
  }
}

class StdinStub extends EventEmitter {
  constructor() { super(); this.isTTY = true; }
  setEncoding() {}
  setRawMode() {}
  ref() {}
  unref() {}
  read() { return null; }
}

test('DiffView: respects terminal height and renders correct content with and without comments', async () => {
  try {
  // Debug: capture stderr to see component errors
  const origErrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    try { console.log(String(chunk || '')); } catch {}
    return origErrWrite(chunk, ...rest);
  };

  // Provide a synthetic diff via a fake git binary in PATH
  const syntheticDiffLines = [
    'diff --git a/src/example.ts b/src/example.ts',
    'index 1234567..89abcde 100644',
    '--- a/src/example.ts',
    '+++ b/src/example.ts',
    '@@ -1,5 +1,30 @@',
    ' export function greet(name: string) {',
    '   return `Hello, ${name}`;',
    ' }',
    '',
    ' // CONTEXT LINES (no syntax highlighting)',
    ...Array.from({length: 60}, (_, i) => ` CTX_LINE_${i+1}`),
  ].join('\n');

  const binDir = fs.mkdtempSync(join(os.tmpdir(), 'fake-git-bin-'));
  const gitPath = join(binDir, 'git');
  const script = `#!/usr/bin/env bash
case " $* " in
  *" diff "*)
    cat <<'DIFF'
${syntheticDiffLines}
DIFF
    exit 0;;
  *" merge-base "*)
    echo "abc123def456"; exit 0;;
  *" ls-files --others "*)
    echo ""; exit 0;;
  *)
    echo ""; exit 0;;
esac
`;
  fs.writeFileSync(gitPath, script, {mode: 0o755});
  process.env.PATH = `${binDir}:${process.env.PATH || ''}`;

  const Ink = await import('../../../node_modules/ink/build/index.js');
  const DiffView = (await import('../../../dist/components/views/DiffView.js')).default;
  const {commentStoreManager} = await import('../../../dist/services/CommentStoreManager.js');

  // Small terminal to make layout constraints clear
  const rows = 16;
  const cols = 100;
  const stdout = new CapturingStdout(cols, rows);
  const stdin = new StdinStub();

  const worktreePath = join(process.cwd(), 'fake/worktree');
  const relFile = 'src/example.ts';

  // 1) Baseline: no comments -> should fill exactly terminal rows
  const inst1 = Ink.render(
    React.createElement(DiffView, {worktreePath, title: 'Diff Viewer', onClose() {}, diffType: 'full'}),
    {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false}
  );
  await new Promise(r => setTimeout(r, 400));
  const frame1 = stdout.lastFrame();
  const totalRows1 = (frame1.match(/\n/g) || []).length + 1;
  assert.equal(totalRows1, rows, `Expected baseline render to use exactly ${rows} rows, got ${totalRows1}\n\nFrame1:\n${frame1}`);
  assert.ok(frame1.includes('Diff Viewer'), 'Title should be visible');
  assert.ok(frame1.includes('📁 src/example.ts'), 'File header should be visible');
  // Ensure the visible CTX lines are contiguous from 1..K and that K is correct
  const ctxNums1 = Array.from(frame1.matchAll(/CTX_LINE_(\d+)/g)).map(m => Number(m[1]));
  const uniqueCtx1 = Array.from(new Set(ctxNums1)).sort((a, b) => a - b);
  assert.ok(uniqueCtx1.length > 0, 'Expected some CTX lines visible without comments');
  // In baseline, expected visible CTX lines K = rows - (title + footer) - (file header + 5 preface lines)
  // = rows - 2 - 6 = rows - 8
  const expectedK1 = rows - 8;
  assert.equal(uniqueCtx1.length, expectedK1, `Expected ${expectedK1} CTX lines visible, got ${uniqueCtx1.length}\n\nFrame1:\n${frame1}`);
  // Verify contiguity: 1..K with no skips
  assert.equal(uniqueCtx1[0], 1, 'First visible CTX should be CTX_LINE_1');
  assert.equal(uniqueCtx1[uniqueCtx1.length - 1], expectedK1, 'Last visible CTX should match expected K');
  for (let i = 0; i < uniqueCtx1.length; i++) {
    assert.equal(uniqueCtx1[i], i + 1, `Expected contiguous CTX sequence at position ${i}, got CTX_LINE_${uniqueCtx1[i]}`);
  }

  try { inst1.unmount?.(); } catch {}

  // 2) With comments -> still fills rows, All Comments box visible, and some CTX remain
  const store = commentStoreManager.getStore(worktreePath);
  store.clear();
  store.addComment(0, relFile, 'CTX_LINE_1', 'test comment');

  const stdout2 = new CapturingStdout(cols, rows);
  const inst2 = Ink.render(
    React.createElement(DiffView, {worktreePath, title: 'Diff Viewer', onClose() {}, diffType: 'full'}),
    {stdout: stdout2, stdin, debug: true, exitOnCtrlC: false, patchConsole: false}
  );
  await new Promise(r => setTimeout(r, 500));
  const frame2 = stdout2.lastFrame();
  const totalRows2 = (frame2.match(/\n/g) || []).length + 1;
  assert.equal(totalRows2, rows, `Expected commented render to use exactly ${rows} rows, got ${totalRows2}\n\nFrame2:\n${frame2}`);
  assert.ok(frame2.includes('All Comments (1):'), 'Expected All Comments box to be shown');
  assert.ok(frame2.includes('src/example.ts:0 - test comment'), 'Expected comment line to be shown');

  const ctxNums2 = Array.from(frame2.matchAll(/CTX_LINE_(\d+)/g)).map(m => Number(m[1]));
  const uniqueCtx2 = Array.from(new Set(ctxNums2)).sort((a, b) => a - b);
  // With comments, the All Comments box consumes 7 rows (margin:1, border:2, padding:2, content:2)
  // So K = (rows - (title + footer) - 7) - 6 = rows - 15
  const expectedK2 = Math.max(0, rows - 15);
  assert.equal(uniqueCtx2.length, expectedK2, `Expected ${expectedK2} CTX lines visible with comments, got ${uniqueCtx2.length}\n\nFrame2:\n${frame2}`);
  if (expectedK2 > 0) {
    assert.equal(uniqueCtx2[0], 1, 'First visible CTX with comments should be CTX_LINE_1');
    assert.equal(uniqueCtx2[uniqueCtx2.length - 1], expectedK2, 'Last visible CTX with comments should match expected K');
    for (let i = 0; i < uniqueCtx2.length; i++) {
      assert.equal(uniqueCtx2[i], i + 1, `Expected contiguous CTX sequence with comments at position ${i}, got CTX_LINE_${uniqueCtx2[i]}`);
    }
  }

  try { inst2.unmount?.(); } catch {}
  } catch (err) {
    console.error('[debug] test error', err?.stack || err);
    throw err;
  }
});
