import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';

process.env.E2E_IGNORE_RAWMODE = '1';
process.env.NO_APP_INTERVALS = '1';

function makeTmpProject(slugs) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-merged-'));
  const trackerDir = path.join(tmpDir, 'tracker');
  fs.mkdirSync(trackerDir, {recursive: true});
  const all = [
    ...(slugs.discovery ?? []),
    ...(slugs.requirements ?? []),
    ...(slugs.implement ?? []),
    ...(slugs.cleanup ?? []),
  ];
  const index = {
    backlog: {backlog: [], discovery: slugs.discovery ?? [], requirements: slugs.requirements ?? []},
    implementation: {implement: slugs.implement ?? [], cleanup: slugs.cleanup ?? []},
    archive: [],
    sessions: Object.fromEntries(all.map(s => [s, {title: s.replace(/-/g, ' ')}])),
  };
  fs.writeFileSync(path.join(trackerDir, 'index.json'), JSON.stringify(index, null, 2));
  return tmpDir;
}

// Pins the data path that has now broken twice silently:
// memoryStore.prStatus → FakeGitHubService → GitHubContext.pullRequests → kanban render.
// Asserts the merged glyph + "Merged" label show on the card whose worktree path
// has a MERGED PR seeded in memoryStore.prStatus.
test('kanban renders Merged label when memoryStore.prStatus has a MERGED PR for the worktree', async () => {
  process.env.E2E_TTY_ROWS = '30';
  process.env.E2E_TTY_COLS = '120';

  const Ink = await import('../../../node_modules/ink/build/index.js');
  const {TestableApp} = await import('../../../dist/App.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {FakeTmuxService} = await import('../../../dist-tests/tests/fakes/FakeTmuxService.js');
  const {FakeGitHubService} = await import('../../../dist-tests/tests/fakes/FakeGitHubService.js');
  const {memoryStore} = await import('../../../dist-tests/tests/fakes/stores.js');
  const {PRStatus} = await import('../../../dist/models.js');
  const {CapturingStdout, StdinStub, waitFor, stripAnsi} = await import('./_utils.js');

  memoryStore.reset();

  const projectPath = makeTmpProject({cleanup: ['merged-feature', 'open-feature']});
  const gitService = new FakeGitService('/fake/projects');
  gitService.addProject('demo', projectPath);
  const mergedWt = gitService.addWorktree('demo', 'merged-feature');
  const openWt = gitService.addWorktree('demo', 'open-feature');

  // Seed the same store FakeGitHubService reads from. GitHubContext.pullRequests
  // gets populated by the kanban's setVisibleWorktrees → refresh path.
  memoryStore.prStatus.set(mergedWt.path, new PRStatus({number: 999, state: 'MERGED'}));
  memoryStore.prStatus.set(openWt.path, new PRStatus({number: 1000, state: 'OPEN'}));

  const stdout = new CapturingStdout();
  stdout.columns = 120;
  stdout.rows = 30;
  const stdin = new StdinStub();

  const tree = React.createElement(TestableApp, {
    gitService,
    gitHubService: new FakeGitHubService(),
    tmuxService: new FakeTmuxService(),
  });
  const inst = Ink.render(tree, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});

  try {
    // Wait for the merged label to appear — this is the assertion that would
    // have failed under the broken `wt.pr.is_merged` lookup.
    await waitFor(
      () => {
        const frame = stripAnsi(stdout.lastFrame() || '');
        return frame.includes('merged-feature') && frame.includes('Merged');
      },
      {timeout: 5000, interval: 50, message: 'kanban merged label visible'},
    );

    const frame = stripAnsi(stdout.lastFrame() || '');
    // The merged glyph (◆) and the "Merged" label both come from the merged
    // branch in getTrackerCardDisplayState. Both must show on the same card.
    assert.ok(frame.includes('◆'), `expected merged glyph ◆ in frame:\n${frame}`);
    assert.ok(frame.includes('Merged'), `expected "Merged" label in frame:\n${frame}`);
    // Open-PR sibling must NOT show the merged label, proving the lookup is
    // path-keyed and not blanket-applied.
    const openIdx = frame.indexOf('open-feature');
    const mergedIdx = frame.indexOf('merged-feature');
    assert.ok(openIdx >= 0 && mergedIdx >= 0, 'both items should render');
    // "Merged" should appear between merged-feature and the next item, not next to open-feature.
    const between = frame.slice(mergedIdx, openIdx > mergedIdx ? openIdx : frame.length);
    assert.ok(between.includes('Merged'), `"Merged" label should attach to merged-feature card. Frame:\n${frame}`);
  } finally {
    try { inst.unmount?.(); } catch {}
    try { fs.rmSync(projectPath, {recursive: true, force: true}); } catch {}
  }
});
