import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {getSessionMarkerPath, writeCurrentSessionMarker} from '../../src/shared/utils/sessionMarker.js';

describe('sessionMarker', () => {
  let originalEnv: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    originalEnv = process.env.DEVTEAM_SESSION_MARKER_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-session-marker-'));
    process.env.DEVTEAM_SESSION_MARKER_DIR = tmpDir;
  });

  afterEach(() => {
    process.env.DEVTEAM_SESSION_MARKER_DIR = originalEnv;
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  test('writes worktree marker into cache and removes legacy file', () => {
    const cwd = '/tmp/projects/devteam-branches/session-marker';
    const legacyPath = path.join(cwd, '.devteam-session');
    fs.mkdirSync(cwd, {recursive: true});
    fs.writeFileSync(legacyPath, 'legacy', 'utf8');

    writeCurrentSessionMarker(cwd);

    const markerPath = getSessionMarkerPath(cwd);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(marker).toEqual({
      v: 1,
      session: 'dev-devteam-session-marker',
      project: 'devteam',
      feature: 'session-marker',
      kind: 'worktree',
    });
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  test('writes workspace marker into cache', () => {
    const cwd = '/tmp/projects/workspaces/feature-a';
    fs.mkdirSync(cwd, {recursive: true});

    writeCurrentSessionMarker(cwd);

    const marker = JSON.parse(fs.readFileSync(getSessionMarkerPath(cwd), 'utf8'));
    expect(marker).toEqual({
      v: 1,
      session: 'dev-workspace-feature-a',
      project: 'workspace',
      feature: 'feature-a',
      kind: 'workspace',
    });
  });

  test('does nothing for paths that are not worktrees or workspaces', () => {
    const cwd = '/tmp/projects/devteam';
    fs.mkdirSync(cwd, {recursive: true});

    writeCurrentSessionMarker(cwd);

    expect(fs.existsSync(getSessionMarkerPath(cwd))).toBe(false);
  });
});
