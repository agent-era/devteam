import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

process.env.E2E_IGNORE_RAWMODE = '1';

// Terminal size combos: [height, width]
const SIZE_COMBOS = [
  [10, 80], [11, 80], [12, 80], [13, 80], [15, 80],
  [20, 80], [24, 80],
  [10, 96], [11, 96], [12, 96], [13, 96], [15, 96],
  [20, 96], [24, 96],
  [27, 105], [30, 120],
];

// Config combos: [label, {hasFileHeader, hasHunkHeader, showCommentSummary, showFileTreeOverlay}]
const CONFIG_COMBOS = [
  ['plain',          {hasFileHeader: false, hasHunkHeader: false, showCommentSummary: false, showFileTreeOverlay: false}],
  ['file-hdr',       {hasFileHeader: true,  hasHunkHeader: false, showCommentSummary: false, showFileTreeOverlay: false}],
  ['file+hunk-hdr',  {hasFileHeader: true,  hasHunkHeader: true,  showCommentSummary: false, showFileTreeOverlay: false}],
  ['with-comments',  {hasFileHeader: true,  hasHunkHeader: false, showCommentSummary: true,  showFileTreeOverlay: false}],
  ['with-overlay',   {hasFileHeader: true,  hasHunkHeader: false, showCommentSummary: false, showFileTreeOverlay: true}],
  ['full',           {hasFileHeader: true,  hasHunkHeader: true,  showCommentSummary: true,  showFileTreeOverlay: false}],
];

// View modes
const VIEW_MODES = ['unified', 'sidebyside'];

for (const [height, width] of SIZE_COMBOS) {
  for (const [configLabel, config] of CONFIG_COMBOS) {
    for (const viewMode of VIEW_MODES) {
      const testLabel = `diffview row visibility ${height}x${width} ${configLabel} ${viewMode}`;
      test(testLabel, async () => {
        process.env.E2E_TTY_ROWS = String(height);
        process.env.E2E_TTY_COLS = String(width);

        const Ink = await import('../../../node_modules/ink/build/index.js');
        const {calculateDiffViewportRows} = await import('../../../dist/shared/utils/layout.js');
        const {CapturingStdout, StdinStub, waitFor, stripAnsi} = await import('./_utils.js');

        const {hasFileHeader, hasHunkHeader, showCommentSummary, showFileTreeOverlay} = config;
        const overlayHeight = showFileTreeOverlay ? Math.max(6, Math.floor(height / 2)) : 0;

        const viewportRows = calculateDiffViewportRows(height, {
          hasFileHeader,
          hasHunkHeader,
          showCommentSummary,
          overlayHeight,
        });

        // Generate exactly viewportRows lines, labeled line-01..line-NN
        const totalLines = viewportRows + 3; // extra lines that should NOT appear (overflow check)
        const lineLabels = Array.from({length: totalLines}, (_, i) =>
          `line-${(i + 1).toString().padStart(2, '0')}`
        );
        const visibleLabels = lineLabels.slice(0, viewportRows);
        const overflowLabels = lineLabels.slice(viewportRows);

        const {Box, Text} = Ink;

        // Minimal component that exactly mirrors DiffView's viewport rendering structure.
        // Uses the same Box hierarchy and row dimensions so the same Yoga layout applies.
        const TestDiffViewport = React.memo(function TestDiffViewport() {
          const rows = visibleLabels.map((label, i) => {
            if (viewMode === 'sidebyside') {
              const half = Math.max(1, Math.floor((width - 2) / 2));
              const lText = label.padEnd(half, ' ');
              const rText = ' '.repeat(half);
              return React.createElement(Box, {key: i, flexDirection: 'row', height: 1, flexShrink: 0},
                React.createElement(Text, {wrap: 'truncate'}, lText),
                React.createElement(Text, {wrap: 'truncate', dimColor: true}, rText),
              );
            }
            const bodyWidth = Math.max(1, width - 4);
            const body = label.padEnd(bodyWidth, ' ');
            return React.createElement(Box, {key: i, flexDirection: 'row', height: 1, flexShrink: 0},
              React.createElement(Text, {color: 'gray'}, '  '),
              React.createElement(Text, {wrap: 'truncate'}, body),
            );
          });

          const children = [
            React.createElement(Text, {key: 'title', bold: true}, 'Diff: demo/feat-01'),
            hasFileHeader && React.createElement(Text, {key: 'fhdr', backgroundColor: 'gray'}, '📁 src/foo.ts'),
            hasHunkHeader && React.createElement(Text, {key: 'hhdr', color: 'cyan', backgroundColor: 'gray'}, '@@ -1,5 +1,8 @@'),
            React.createElement(Box, {key: 'vp', flexDirection: 'column', height: viewportRows}, ...rows),
            showCommentSummary && React.createElement(Text, {key: 'cmt', color: 'blue', wrap: 'truncate'}, 'Comments (1): src/foo.ts:3 fix this'),
            !showFileTreeOverlay && React.createElement(Text, {key: 'ftr', color: 'magenta', wrap: 'truncate'}, 'Shift+↑/↓ prev/next file  [v]iew  [q] close'),
            showFileTreeOverlay && React.createElement(Box, {key: 'overlay', flexDirection: 'column', height: overlayHeight},
              React.createElement(Text, null, 'file-tree-overlay'),
            ),
          ].filter(Boolean);

          return React.createElement(Box, {flexDirection: 'column', flexGrow: 1}, ...children);
        });

        const stdout = new CapturingStdout();
        stdout.columns = width;
        stdout.rows = height;
        const stdin = new StdinStub();

        const inst = Ink.render(
          React.createElement(TestDiffViewport),
          {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false}
        );

        try {
          // Wait for at least the first line to appear
          await waitFor(
            () => (stdout.lastFrame() || '').replace(/\u001b\[[^a-zA-Z]*[a-zA-Z]/g, '').includes('line-01'),
            {timeout: 3000, interval: 20, message: `line-01 visible at ${height}x${width} ${configLabel} ${viewMode}`}
          );

          const frame = stdout.lastFrame() || '';
          const clean = stripAnsi(frame);

          // Assert every visible line appears
          for (const label of visibleLabels) {
            assert.ok(
              clean.includes(label),
              `Expected ${label} to be visible at ${height}x${width} ${configLabel} ${viewMode} (viewportRows=${viewportRows}). Frame:\n${clean}`
            );
          }

          // Assert overflow lines do NOT appear
          for (const label of overflowLabels) {
            assert.ok(
              !clean.includes(label),
              `Expected ${label} to NOT be visible at ${height}x${width} ${configLabel} ${viewMode} (viewportRows=${viewportRows}). Frame:\n${clean}`
            );
          }
        } finally {
          try { inst.unmount?.(); } catch {}
          await new Promise(r => setTimeout(r, 20));
        }
      });
    }
  }
}
