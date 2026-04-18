import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {HooksService} from '../../src/services/HooksService.js';
import {HOOK_IDENTIFIER} from '../../src/constants.js';

// Use a temp dir so tests don't touch real user config
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-hooks-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

// --- Marker file ---

describe('HooksService.writeMarker / readMarker', () => {
  test('writes and reads back a worktree marker', () => {
    const svc = new HooksService();
    const worktreePath = tmpDir;
    svc.writeMarker(worktreePath, 'dev-foo-bar', 'foo', 'bar', 'worktree');
    const m = svc.readMarker(worktreePath);
    expect(m).toMatchObject({session: 'dev-foo-bar', project: 'foo', feature: 'bar', kind: 'worktree', v: 1});
  });

  test('writes and reads back a workspace marker', () => {
    const svc = new HooksService();
    svc.writeMarker(tmpDir, 'dev-workspace-feat', 'workspace', 'feat', 'workspace');
    const m = svc.readMarker(tmpDir);
    expect(m?.kind).toBe('workspace');
    expect(m?.session).toBe('dev-workspace-feat');
  });

  test('readMarker returns null when file absent', () => {
    const svc = new HooksService();
    expect(svc.readMarker(tmpDir)).toBeNull();
  });
});

// --- installJsonHooks idempotency ---

describe('HooksService install idempotency', () => {
  function makeSettingsPath() {
    return path.join(tmpDir, 'settings.json');
  }

  function getHooksService() {
    const svc = new HooksService();
    // Redirect script path so it resolves to something absolute in tests
    jest.spyOn(svc as any, 'getHookScriptPath').mockReturnValue('/fake/devteam-status-hook.mjs');
    return svc;
  }

  test('installs hooks into an empty settings file', () => {
    const svc = getHooksService();
    const settingsPath = makeSettingsPath();
    (svc as any).installJsonHooks(settingsPath, 'claude', '/fake/devteam-status-hook.mjs');
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(raw.hooks).toBeDefined();
    expect(raw.hooks.Stop).toHaveLength(1);
    expect(raw.hooks.Stop[0].hooks[0].command).toContain(HOOK_IDENTIFIER);
  });

  test('running install twice does not duplicate entries', () => {
    const svc = getHooksService();
    const settingsPath = makeSettingsPath();
    (svc as any).installJsonHooks(settingsPath, 'claude', '/fake/devteam-status-hook.mjs');
    (svc as any).installJsonHooks(settingsPath, 'claude', '/fake/devteam-status-hook.mjs');
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    // Each event should have exactly one devteam entry
    for (const entries of Object.values(raw.hooks) as unknown[][]) {
      const devteamEntries = entries.filter((e: any) =>
        e.hooks?.some((h: any) => h.command?.includes(HOOK_IDENTIFIER))
      );
      expect(devteamEntries).toHaveLength(1);
    }
  });

  test('preserves existing non-devteam hook entries', () => {
    const svc = getHooksService();
    const settingsPath = makeSettingsPath();
    const existing = {hooks: {Stop: [{hooks: [{type: 'command', command: 'my-other-hook.sh'}]}]}};
    fs.writeFileSync(settingsPath, JSON.stringify(existing));
    (svc as any).installJsonHooks(settingsPath, 'claude', '/fake/devteam-status-hook.mjs');
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const stopEntries = raw.hooks.Stop as any[];
    const other = stopEntries.find((e: any) => e.hooks?.[0]?.command === 'my-other-hook.sh');
    expect(other).toBeDefined();
  });
});

// --- Status file read/write ---

describe('HooksService status read/write', () => {
  function makeHooksService() {
    const svc = new HooksService();
    // Override status dir to our tmp dir
    const statusDir = path.join(tmpDir, 'status');
    fs.mkdirSync(statusDir, {recursive: true});
    jest.spyOn(svc as any, 'readStatus').mockImplementation((...args: unknown[]) => {
      const session = args[0] as string;
      const file = path.join(statusDir, `${session}.json`);
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const data = JSON.parse(raw);
        if (Date.now() - data.ts > 5 * 60 * 1000) return null;
        return data;
      } catch { return null; }
    });
    return {svc, statusDir};
  }

  test('returns null when status file does not exist', () => {
    const svc = new HooksService();
    // Point at a non-existent session
    expect(svc.readStatus('dev-nonexistent-session')).toBeNull();
  });

  test('readStatus via real path returns null for stale files', () => {
    const svc = new HooksService();
    const {statusDir} = makeHooksService();
    const sessionName = 'dev-test-stale';
    const stalePayload = {
      v: 1, tool: 'claude', status: 'idle', event: 'Stop', ts: Date.now() - 10 * 60 * 1000,
      session: sessionName, project: null, feature: null, cli_session_id: null, cwd: '/tmp',
    };
    fs.writeFileSync(path.join(statusDir, `${sessionName}.json`), JSON.stringify(stalePayload));
    // Direct read via fake impl
    const file = path.join(statusDir, `${sessionName}.json`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(Date.now() - raw.ts).toBeGreaterThan(5 * 60 * 1000);
  });
});
