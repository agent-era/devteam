import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';

// Don't require real TTY for raw-mode
process.env.E2E_IGNORE_RAWMODE = '1';
process.env.NO_APP_INTERVALS = '1';

// Exercise the board at the same terminal-size matrix used for the main view and
// diff view visibility tests, with a couple of extra extremes.
const SIZE_COMBOS = [
  [10, 80], [12, 80], [15, 80], [20, 80], [24, 80],
  [10, 96], [12, 96], [15, 96], [20, 96], [24, 96],
  [30, 120], [40, 160],
];

function makeTmpProject(slugs) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-kanban-'));
  const trackerDir = path.join(tmpDir, 'tracker');
  fs.mkdirSync(trackerDir, {recursive: true});
  const index = {
    backlog: {backlog: [], discovery: slugs.discovery ?? [], requirements: slugs.requirements ?? []},
    implementation: {implement: slugs.implement ?? [], cleanup: slugs.cleanup ?? []},
    archive: [],
    sessions: Object.fromEntries(
      [
        ...(slugs.discovery ?? []),
        ...(slugs.requirements ?? []),
        ...(slugs.implement ?? []),
        ...(slugs.cleanup ?? []),
      ].map(s => [s, {title: s.replace(/-/g, ' ')}])
    ),
  };
  fs.writeFileSync(path.join(trackerDir, 'index.json'), JSON.stringify(index, null, 2));
  return tmpDir;
}

async function renderBoard({width, height, slugs = {discovery: ['alpha'], requirements: [], implement: [], cleanup: []}}) {
  process.env.E2E_TTY_ROWS = String(height);
  process.env.E2E_TTY_COLS = String(width);

  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore} = await import('../../../dist-tests/tests/fakes/stores.js');
  const {CapturingStdout, StdinStub, waitFor, stripAnsi} = await import('./_utils.js');

  memoryStore.reset();

  const projectPath = makeTmpProject(slugs);
  const gitService = new FakeGitService('/fake/projects');
  gitService.addProject('demo', projectPath);
  const gitHubService = new FakeGitHubService();
  const tmuxService = new FakeTmuxService();

  const stdout = new CapturingStdout();
  stdout.columns = width;
  stdout.rows = height;
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {gitService, gitHubService, tmuxService});
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

  // Wait for the kanban board to render; TestableApp auto-navigates to the tracker
  // for the only known project on startup. Group titles are signalled by column
  // borders + colors rather than dedicated label rows, so we key on the column
  // titles themselves.
  await waitFor(
    () => {
      const frame = stripAnsi(stdout.lastFrame() || '');
      return frame.includes('Discovery') && frame.includes('Implement');
    },
    {timeout: 3000, interval: 30, message: `kanban board visible at ${height}x${width}`}
  );

  return {
    frame: () => stripAnsi(stdout.lastFrame() || ''),
    rawFrame: () => stdout.lastFrame() || '',
    cleanup: () => {
      try { inst.unmount?.(); } catch {}
      try { fs.rmSync(projectPath, {recursive: true, force: true}); } catch {}
    },
  };
}

for (const [height, width] of SIZE_COMBOS) {
  test(`tracker board ${height}x${width}: title bar shows project name on a single line`, async () => {
    const {frame, cleanup} = await renderBoard({width, height});
    try {
      const text = frame();
      const lines = text.split('\n');
      const titleLine = lines.findIndex(l => l.includes('demo') && l.includes('tracker'));
      assert.notStrictEqual(titleLine, -1,
        `Expected title bar with "demo · tracker" at ${height}x${width}. Frame:\n${text}`);
      // The title bar should fit in a single row — never wrap onto a second line.
      assert.ok(lines[titleLine].includes('demo'),
        `Expected project name on the same line as "tracker". Frame:\n${text}`);
    } finally { cleanup(); }
  });

  test(`tracker board ${height}x${width}: all four column titles are visible`, async () => {
    const {frame, cleanup} = await renderBoard({width, height});
    try {
      const text = frame();
      // Column titles come from STAGE_LABELS in TrackerService. Cleanup column uses
      // the extended label "Cleanup and Submit" when there's room; at narrow widths
      // truncateDisplay may trim it, so we assert the leading word is present.
      assert.ok(text.includes('Discovery'), `Discovery column missing at ${height}x${width}`);
      assert.ok(text.includes('Requirements'), `Requirements column missing at ${height}x${width}`);
      assert.ok(text.includes('Implement'), `Implement column missing at ${height}x${width}`);
      assert.ok(text.includes('Cleanup'), `Cleanup column missing at ${height}x${width}`);
    } finally { cleanup(); }
  });

  test(`tracker board ${height}x${width}: column boxes occupy most of the terminal height`, async () => {
    const {frame, cleanup} = await renderBoard({width, height});
    try {
      const text = frame();
      const lines = text.split('\n');
      // Column borders use ╭ / ╰. The first ╭ marks the top of the column boxes;
      // the last ╰ marks the bottom. Their span is the visible board height. We
      // want minimal chrome — at least 80% of the terminal should be column boxes.
      const top = lines.findIndex(l => l.includes('╭'));
      let bottom = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('╰')) { bottom = i; break; }
      }
      assert.ok(top !== -1 && bottom > top, `Column boxes not found at ${height}x${width}`);
      const boardSpan = bottom - top + 1;
      const minSpan = Math.max(6, Math.floor(height * 0.8));
      assert.ok(
        boardSpan >= minSpan,
        `Board only ${boardSpan} of ${height} rows at ${height}x${width} ` +
        `(want ≥${minSpan}). Too much chrome above/below. Frame:\n${text}`
      );
    } finally { cleanup(); }
  });

  test(`tracker board ${height}x${width}: rendered output does not exceed terminal rows`, async () => {
    const {frame, cleanup} = await renderBoard({width, height});
    try {
      const text = frame();
      const lines = text.split('\n');
      // Ink writes trailing blank lines; drop pure-whitespace trailing rows before
      // counting. We still care that the populated area fits in `height` rows.
      let last = lines.length;
      while (last > 0 && lines[last - 1].trim() === '') last--;
      const populated = last;
      assert.ok(
        populated <= height,
        `Rendered frame is ${populated} rows, exceeds terminal height ${height}. Frame:\n${text}`
      );
    } finally { cleanup(); }
  });

  test(`tracker board ${height}x${width}: planning and implementation column headers align vertically`, async () => {
    const {frame, cleanup} = await renderBoard({width, height});
    try {
      const text = frame();
      const lines = text.split('\n');
      // The Discovery column lives in the planning group; the Implement column in
      // the implementation group. If the two groups' widths differ, one group's
      // columns push down a row and the titles end up on different lines.
      const discoveryLine = lines.findIndex(l => l.includes('Discovery'));
      const implementLine = lines.findIndex(l => l.includes('Implement'));
      assert.notStrictEqual(discoveryLine, -1, 'Discovery column title not found');
      assert.notStrictEqual(implementLine, -1, 'Implement column title not found');
      assert.strictEqual(
        discoveryLine, implementLine,
        `Planning and implementation columns misaligned at ${height}x${width}: ` +
        `Discovery on line ${discoveryLine}, Implement on line ${implementLine}. Frame:\n${text}`
      );
    } finally { cleanup(); }
  });
}

// Scrolling / overflow — make sure many items in a column fit within its box
// (bounded by the terminal height) and surface an indicator for off-screen items.
test('tracker board with many items: column clips and shows scroll indicator', async () => {
  const height = 20;
  const width = 100;
  const many = Array.from({length: 30}, (_, i) => `itm-${String(i + 1).padStart(2, '0')}`);
  const {frame, cleanup} = await renderBoard({
    width,
    height,
    slugs: {discovery: many, requirements: ['req-01'], implement: [], cleanup: []},
  });
  try {
    const text = frame();
    const lines = text.split('\n');
    // Trim trailing blank rows
    let last = lines.length;
    while (last > 0 && lines[last - 1].trim() === '') last--;
    assert.ok(
      last <= height,
      `Frame with 30 items occupies ${last} rows, exceeds terminal height ${height}. Frame:\n${text}`
    );
    assert.ok(
      text.includes('more'),
      `Expected scroll indicator ("↓ N more" / "↑ N more") when a column overflows. Frame:\n${text}`
    );
    // Only a subset of the 30 items should be visible; the last items shouldn't all appear.
    let visibleCount = 0;
    for (const slug of many) if (text.includes(slug)) visibleCount++;
    assert.ok(
      visibleCount < many.length,
      `Expected scroll to clip items, but all ${many.length} rendered. Frame:\n${text}`
    );
    assert.ok(
      visibleCount >= 1,
      `Expected at least the top item to render. Frame:\n${text}`
    );
  } finally { cleanup(); }
});
