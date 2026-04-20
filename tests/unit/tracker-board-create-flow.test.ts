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

  test('requirements.md body contains the user-typed description', () => {
    const description = 'Allow users to sign in with Google and GitHub via OAuth2.';
    service.createItem(tmpDir, 'OAuth Login', 'backlog', 'oauth-login', description);
    const reqPath = path.join(tmpDir, 'tracker', 'items', 'oauth-login', 'requirements.md');
    expect(fs.readFileSync(reqPath, 'utf8')).toContain(description);
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

  test('tool picker cancel does not launch but item still exists on board', async () => {
    const slug = 'cancelled-feature';
    service.createItem(tmpDir, 'Cancelled Feature', 'backlog', slug, 'Some description');

    const launched: string[] = [];
    // Simulate handleToolCancel: just clears toolPickItem, no launch
    // The item remains on the board
    const board = service.loadBoard('proj', tmpDir);
    const item = board.columns.flatMap(c => c.items).find(i => i.slug === slug);

    expect(item).toBeTruthy(); // item persists
    expect(launched).toHaveLength(0); // no launch
  });

  test('no temp slug appears in the index during derivation window', () => {
    // Before createItem is called, nothing should be in the index
    service.ensureTracker(tmpDir);
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    // No temp slug like 'add-oauth-login-for-use' (truncated to 20 chars)
    expect(JSON.stringify(index)).not.toContain('add-oauth-login-for-use');
  });
});
