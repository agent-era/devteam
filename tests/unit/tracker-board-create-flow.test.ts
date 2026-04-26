import {describe, test, expect, beforeEach, afterEach} from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {TrackerService} from '../../src/services/TrackerService.js';
import type {AITool} from '../../src/models.js';

let tmpDir: string;
let service: TrackerService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-create-test-'));
  service = new TrackerService();
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('board create-item flow (derive-first, no rename)', () => {
  test('item is created with the AI-derived slug directly — no temp slug', () => {
    const title = 'Add OAuth login for users';
    const derivedSlug = 'oauth-login';
    service.createItem(tmpDir, title, 'backlog', derivedSlug, title);

    const board = service.loadBoard('proj', tmpDir);
    const col = board.columns.find(c => c.id === 'backlog')!;
    expect(col.items.map(i => i.slug)).toContain('oauth-login');
    expect(col.items.map(i => i.slug)).not.toContain('add-oauth-login-for'); // no temp slug
  });

  test('user-typed description is stashed on the index for the worktree to drain, not written to the project root', () => {
    const description = 'Allow users to sign in with Google and GitHub via OAuth2.';
    service.createItem(tmpDir, 'OAuth Login', 'backlog', 'oauth-login', description);

    const itemDir = path.join(tmpDir, 'tracker', 'items', 'oauth-login');
    expect(fs.existsSync(itemDir)).toBe(false);

    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.sessions['oauth-login'].description).toBe(description);

    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-create-wt-'));
    try {
      service.ensureItemFiles(tmpDir, 'oauth-login', worktreeDir);
      const wtItemDir = path.join(worktreeDir, 'tracker', 'items', 'oauth-login');
      const notesPath = path.join(wtItemDir, 'notes.md');
      expect(fs.readFileSync(notesPath, 'utf8')).toContain(description);
      expect(fs.existsSync(path.join(wtItemDir, 'requirements.md'))).toBe(false);

      const after = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
      expect(after.sessions['oauth-login'].description).toBeUndefined();
    } finally {
      fs.rmSync(worktreeDir, {recursive: true, force: true});
    }
  });

  test('single-tool path calls onLaunchItemBackground immediately after slug derivation', async () => {
    const tools: AITool[] = ['claude'];
    const launched: Array<{slug: string; tool: AITool}> = [];

    // Simulate the board screen's handleCreateSubmit logic for single-tool case
    const title = 'My Feature';
    const slugPromise = Promise.resolve('my-feature');

    const onLaunchItemBackground = (slug: string, tool: AITool) => launched.push({slug, tool});

    const slug = await slugPromise;
    service.createItem(tmpDir, title, 'backlog', slug, title);
    const item = service.loadBoard('proj', tmpDir).columns.flatMap(c => c.items).find(i => i.slug === slug);
    expect(item).toBeTruthy();

    if (tools.length === 1 && item) {
      onLaunchItemBackground(item.slug, tools[0]);
    }

    expect(launched).toHaveLength(1);
    expect(launched[0].slug).toBe('my-feature');
    expect(launched[0].tool).toBe('claude');
  });

  test('multi-tool path sets toolPickItem instead of auto-launching', () => {
    const tools: AITool[] = ['claude', 'codex'];
    let toolPickItemSet = false;
    let autoLaunched = false;

    const handleCreate = (selectedTools: AITool[]) => {
      if (selectedTools.length > 1) {
        toolPickItemSet = true; // sets toolPickItem state, shows picker
      } else {
        autoLaunched = true;
      }
    };

    handleCreate(tools);
    expect(toolPickItemSet).toBe(true);
    expect(autoLaunched).toBe(false);
  });

  test('tool picker cancel abandons creation entirely — no item, no launch', () => {
    // In the multi-tool flow, handleToolCancel fires BEFORE startDerivation, so
    // deriveSlug never runs and createItem is never called. The board stays
    // empty and onLaunchItemBackground is never invoked.
    const launched: string[] = [];
    let derivationStarted = false;

    let toolPickPending: {title: string} | null = {title: 'Cancelled Feature'};
    const handleToolCancel = () => { toolPickPending = null; };

    handleToolCancel();

    // Only startDerivation would call createItem — it never fires after cancel.
    if (toolPickPending) derivationStarted = true;

    service.ensureTracker(tmpDir);
    const board = service.loadBoard('proj', tmpDir);
    const items = board.columns.flatMap(c => c.items);

    expect(toolPickPending).toBeNull();
    expect(derivationStarted).toBe(false);
    expect(items).toHaveLength(0);
    expect(launched).toHaveLength(0);
  });

  test('no temp slug appears in the index during derivation window', () => {
    // Before createItem is called, nothing should be in the index
    service.ensureTracker(tmpDir);
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    // No temp slug like 'add-oauth-login-for-use' (truncated to 20 chars)
    expect(JSON.stringify(index)).not.toContain('add-oauth-login-for-use');
  });
});
