import fs from 'node:fs';
import path from 'node:path';
import {
  HOOK_STATUS_DIR,
  HOOK_INSTALL_SKIP_FILE,
  MARKER_FILE,
  HOOK_IDENTIFIER,
  CLAUDE_USER_SETTINGS,
  GEMINI_USER_SETTINGS,
  CODEX_USER_HOOKS,
  CODEX_USER_CONFIG_TOML,
  DEVTEAM_USER_DIR,
} from '../constants.js';
import type {AIStatus} from '../models.js';
import {ensureDirectory, readJSONFile, writeJSONAtomic} from '../shared/utils/fileSystem.js';

export interface SessionMarker {
  v: number;
  session: string;
  project: string;
  feature: string;
  kind: 'worktree' | 'workspace';
}

export interface HookStatus {
  v: number;
  tool: string;
  status: AIStatus;
  event: string;
  ts: number;
  session: string;
  project: string | null;
  feature: string | null;
  cli_session_id: string | null;
  cwd: string;
}

const STATUS_STALE_MS = 5 * 60 * 1_000;

const COMMON_EVENTS: Array<{event: string; matcher?: string}> = [
  {event: 'SessionStart'},
  {event: 'SessionEnd'},
];

const TOOL_EVENTS: Record<'claude' | 'gemini' | 'codex', Array<{event: string; matcher?: string}>> = {
  claude: [
    ...COMMON_EVENTS,
    {event: 'UserPromptSubmit'},
    {event: 'PreToolUse'},
    {event: 'Stop'},
    {event: 'Notification', matcher: 'permission_prompt|idle_prompt'},
  ],
  gemini: [
    ...COMMON_EVENTS,
    {event: 'BeforeAgent'},
    {event: 'BeforeModel'},
    {event: 'AfterAgent'},
    {event: 'Notification'},
  ],
  codex: [
    ...COMMON_EVENTS,
    {event: 'UserPromptSubmit'},
    {event: 'PreToolUse'},
    {event: 'PostToolUse'},
    {event: 'Stop'},
  ],
};

export class HooksService {
  private readonly statusDir: string;

  constructor(opts: {statusDir?: string} = {}) {
    this.statusDir = opts.statusDir ?? HOOK_STATUS_DIR;
  }

  // --- Marker file ---

  writeMarker(worktreePath: string, session: string, project: string, feature: string, kind: 'worktree' | 'workspace'): void {
    const marker: SessionMarker = {v: 1, session, project, feature, kind};
    try { fs.writeFileSync(path.join(worktreePath, MARKER_FILE), JSON.stringify(marker, null, 2)); } catch {}
  }

  readMarker(worktreePath: string): SessionMarker | null {
    return readJSONFile<SessionMarker>(path.join(worktreePath, MARKER_FILE));
  }

  // --- Status files ---

  readStatus(sessionName: string): HookStatus | null {
    return readJSONFile<HookStatus>(path.join(this.statusDir, `${sessionName}.json`));
  }

  isStale(status: HookStatus): boolean {
    return Date.now() - status.ts > STATUS_STALE_MS;
  }

  clearStatus(sessionName: string): void {
    try { fs.unlinkSync(path.join(this.statusDir, `${sessionName}.json`)); } catch {}
  }

  // --- Install / check ---

  isInstalled(): boolean {
    return (
      this.hasDevteamHook(CLAUDE_USER_SETTINGS) ||
      this.hasDevteamHook(GEMINI_USER_SETTINGS) ||
      this.hasDevteamHook(CODEX_USER_HOOKS)
    );
  }

  isInstallSkipped(): boolean {
    return fs.existsSync(HOOK_INSTALL_SKIP_FILE);
  }

  skipInstall(): void {
    try {
      ensureDirectory(DEVTEAM_USER_DIR);
      fs.writeFileSync(HOOK_INSTALL_SKIP_FILE, String(Date.now()));
    } catch {}
  }

  getHookScriptPath(): string {
    const scriptName = path.join('scripts', 'devteam-status-hook.mjs');
    // Search from the running binary (handles npm global installs) and cwd (dev)
    const binaryDir = process.argv[1] ? path.dirname(process.argv[1]) : '';
    const searchRoots = [
      binaryDir ? path.resolve(binaryDir, '..') : '',   // dist/bin/ → package root
      binaryDir ? path.resolve(binaryDir, '..', '..') : '', // nested installs
      process.cwd(),
    ].filter(Boolean);
    for (const root of searchRoots) {
      const candidate = path.join(root, scriptName);
      if (fs.existsSync(candidate)) return candidate;
    }
    return path.resolve(searchRoots[0] || process.cwd(), scriptName);
  }

  installAll(): {installed: string[]; errors: string[]} {
    const scriptPath = this.getHookScriptPath();
    const installed: string[] = [];
    const errors: string[] = [];

    for (const [tool, configPath] of [
      ['claude', CLAUDE_USER_SETTINGS],
      ['gemini', GEMINI_USER_SETTINGS],
      ['codex', CODEX_USER_HOOKS],
    ] as const) {
      try {
        this.installJsonHooks(configPath, tool, scriptPath);
        if (tool === 'codex') this.ensureCodexHooksEnabled();
        installed.push(tool);
      } catch (err) {
        errors.push(`${tool}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return {installed, errors};
  }

  // --- Private helpers ---

  private installJsonHooks(configPath: string, tool: 'claude' | 'gemini' | 'codex', scriptPath: string): void {
    ensureDirectory(path.dirname(configPath));
    const config: Record<string, unknown> = readJSONFile(configPath) ?? {};
    const hooks = (config.hooks as Record<string, unknown[]>) ?? {};

    for (const {event, matcher} of TOOL_EVENTS[tool]) {
      const existing = ((hooks[event] as unknown[]) ?? []).filter((e) => !this.isDevteamEntry(e));
      const entry: Record<string, unknown> = {
        hooks: [{type: 'command', command: `node ${JSON.stringify(scriptPath)} ${tool} ${event}`}],
      };
      if (matcher) entry.matcher = matcher;
      hooks[event] = [...existing, entry];
    }

    config.hooks = hooks;
    writeJSONAtomic(configPath, config);
  }

  private ensureCodexHooksEnabled(): void {
    ensureDirectory(path.dirname(CODEX_USER_CONFIG_TOML));
    let content = '';
    try { content = fs.readFileSync(CODEX_USER_CONFIG_TOML, 'utf8'); } catch {}
    if (/codex_hooks\s*=\s*true/.test(content)) return;

    let updated: string;
    if (/codex_hooks\s*=/.test(content)) {
      // Key exists with wrong value — update it
      updated = content.replace(/codex_hooks\s*=\s*\S+/, 'codex_hooks = true');
    } else if (/^\[features\]/m.test(content)) {
      // [features] section exists but lacks codex_hooks — insert key right after header
      updated = content.replace(/^\[features\]/m, '[features]\ncodex_hooks = true');
    } else {
      // No [features] section — append it
      updated = content + (content && !content.endsWith('\n') ? '\n' : '') + '[features]\ncodex_hooks = true\n';
    }
    fs.writeFileSync(CODEX_USER_CONFIG_TOML, updated);
  }

  private isDevteamEntry(entry: unknown): boolean {
    if (typeof entry !== 'object' || !entry) return false;
    const hooks = (entry as Record<string, unknown>).hooks;
    return Array.isArray(hooks) && hooks.some(
      (h) => typeof (h as Record<string, unknown>).command === 'string' &&
              ((h as Record<string, unknown>).command as string).includes(HOOK_IDENTIFIER)
    );
  }

  private hasDevteamHook(configPath: string): boolean {
    try { return fs.readFileSync(configPath, 'utf8').includes(HOOK_IDENTIFIER); } catch { return false; }
  }
}
