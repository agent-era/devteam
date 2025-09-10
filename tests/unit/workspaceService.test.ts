import {describe, test, expect, beforeEach, afterEach} from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkspaceService} from '../../src/services/WorkspaceService.js';

function mkdtemp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-ws-'));
  return dir;
}

describe('WorkspaceService', () => {
  let base: string;
  let ws: WorkspaceService;

  beforeEach(() => {
    base = mkdtemp();
    ws = new WorkspaceService();
    // Create fake projects with docs
    fs.mkdirSync(path.join(base, 'projA'), {recursive: true});
    fs.mkdirSync(path.join(base, 'projB'), {recursive: true});
    fs.writeFileSync(path.join(base, 'projA', 'AGENTS.md'), '# A');
    fs.writeFileSync(path.join(base, 'projB', 'CLAUDE.md'), '# B');
    // Create fake worktrees
    fs.mkdirSync(path.join(base, 'projA-branches', 'feat-x'), {recursive: true});
    fs.mkdirSync(path.join(base, 'projB-branches', 'feat-x'), {recursive: true});
  });

  afterEach(() => {
    try { fs.rmSync(base, {recursive: true, force: true}); } catch {}
  });

  test('creates workspace with symlinks and aggregated docs', () => {
    const feature = 'feat-x';
    const workspaceDir = ws.createWorkspace(base, feature, [
      {project: 'projA', worktreePath: path.join(base, 'projA-branches', feature)},
      {project: 'projB', worktreePath: path.join(base, 'projB-branches', feature)},
    ]);

    // Workspace directory exists
    expect(fs.existsSync(workspaceDir)).toBe(true);
    // Symlinks exist
    const linkA = path.join(workspaceDir, 'projA');
    const linkB = path.join(workspaceDir, 'projB');
    expect(fs.existsSync(linkA)).toBe(true);
    expect(fs.lstatSync(linkA).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(linkB)).toBe(true);
    expect(fs.lstatSync(linkB).isSymbolicLink()).toBe(true);

    // Aggregated docs reference project docs with relative paths
    const agents = fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8');
    const claude = fs.readFileSync(path.join(workspaceDir, 'CLAUDE.md'), 'utf8');
    expect(agents).toContain('projA: ../../projA/AGENTS.md');
    expect(claude).toContain('projB: ../../projB/CLAUDE.md');
  });

  test('hasWorkspaceForFeature detects workspace', () => {
    const feature = 'ws-detect';
    expect(ws.hasWorkspaceForFeature(base, feature)).toBe(false);
    const dir = ws.createWorkspace(base, feature, []);
    expect(ws.hasWorkspaceForFeature(base, feature)).toBe(true);
    expect(dir).toBe(path.join(base, 'workspaces', feature));
  });
});

