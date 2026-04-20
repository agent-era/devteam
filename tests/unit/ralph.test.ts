import {describe, test, expect, beforeEach, afterEach} from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  RalphCore,
  DEFAULT_RALPH_CONFIG,
  loadRalphConfig,
  saveRalphConfig,
  buildNudgeText,
  RalphConfig,
} from '../../src/cores/RalphCore.js';
import {TrackerService, ItemStatus} from '../../src/services/TrackerService.js';
import {WorktreeInfo, SessionInfo} from '../../src/models.js';

// Minimal sendText-capturing fake. We don't need the full FakeTmuxService
// surface here — the ralph loop only ever calls sendText().
class CapturingTmuxService {
  public sent: Array<{session: string; text: string; executeCommand?: boolean}> = [];
  sendText(session: string, text: string, options: {executeCommand?: boolean} = {}) {
    this.sent.push({session, text, executeCommand: options.executeCommand});
  }
}

function makeWorktree(opts: {
  project?: string;
  feature?: string;
  ai_status?: SessionInfo['ai_status'];
  attached?: boolean;
} = {}): WorktreeInfo {
  return new WorktreeInfo({
    project: opts.project ?? 'proj',
    feature: opts.feature ?? 'my-slug',
    path: '/tmp/ignored',
    branch: 'feature',
    session: new SessionInfo({
      session_name: `dev-${opts.project ?? 'proj'}-${opts.feature ?? 'my-slug'}`,
      attached: opts.attached ?? true,
      ai_status: opts.ai_status ?? 'idle',
      ai_tool: 'claude',
    }),
  });
}

let tmpDir: string;
let projectPath: string;
let tracker: TrackerService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-test-'));
  projectPath = path.join(tmpDir, 'proj');
  fs.mkdirSync(path.join(projectPath, 'tracker', 'items', 'my-slug'), {recursive: true});
  tracker = new TrackerService();
  tracker.ensureTracker(projectPath);
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

function writeStatus(slug: string, status: Partial<ItemStatus>): void {
  tracker.writeItemStatus(projectPath, slug, {
    stage: 'discovery',
    is_waiting_for_user: false,
    brief_description: '',
    timestamp: new Date().toISOString(),
    ...status,
  });
}

function enableRalph(overrides: Partial<RalphConfig> = {}): void {
  saveRalphConfig(projectPath, {
    enabled: true,
    idleThresholdMs: 60_000,
    maxNudgesPerStage: 3,
    ...overrides,
  });
}

function buildCore(opts: {
  worktrees: readonly WorktreeInfo[];
  now: () => number;
  tmux?: CapturingTmuxService;
}): {core: RalphCore; tmux: CapturingTmuxService; logs: string[]} {
  const tmux = opts.tmux ?? new CapturingTmuxService();
  const logs: string[] = [];
  const core = new RalphCore({
    tracker,
    // The fake's surface is a subset of TmuxService but typesafe where the
    // core calls into it. Cast is safe — only sendText is invoked.
    tmux: tmux as any,
    getWorktrees: () => opts.worktrees,
    getProjectPath: (p) => (p === 'proj' ? projectPath : ''),
    now: opts.now,
    logger: (line) => logs.push(line),
  });
  return {core, tmux, logs};
}

// ─── ralph.json load/save ───────────────────────────────────────────────────

describe('ralph config load/save', () => {
  test('loadRalphConfig returns defaults when file is missing', () => {
    const cfg = loadRalphConfig(projectPath);
    expect(cfg).toEqual(DEFAULT_RALPH_CONFIG);
  });

  test('round-trips through saveRalphConfig', () => {
    saveRalphConfig(projectPath, {
      enabled: true,
      idleThresholdMs: 10_000,
      maxNudgesPerStage: 5,
    });
    expect(loadRalphConfig(projectPath)).toEqual({
      enabled: true,
      idleThresholdMs: 10_000,
      maxNudgesPerStage: 5,
    });
  });

  test('rejects garbage fields and falls back to defaults', () => {
    fs.writeFileSync(
      path.join(projectPath, 'tracker', 'ralph.json'),
      JSON.stringify({enabled: 'yes', idleThresholdMs: -5, maxNudgesPerStage: 'infinity'}),
    );
    const cfg = loadRalphConfig(projectPath);
    expect(cfg.enabled).toBe(DEFAULT_RALPH_CONFIG.enabled);
    expect(cfg.idleThresholdMs).toBe(DEFAULT_RALPH_CONFIG.idleThresholdMs);
    expect(cfg.maxNudgesPerStage).toBe(DEFAULT_RALPH_CONFIG.maxNudgesPerStage);
  });
});

// ─── buildNudgeText ─────────────────────────────────────────────────────────

describe('buildNudgeText', () => {
  test('references stage guide path and output file', () => {
    const text = buildNudgeText({slug: 'abc', stage: 'discovery', inputMode: 'ask_questions', gateOnAdvance: 'none'});
    expect(text).toContain('discovery');
    expect(text).toContain('2-discovery.md');
    expect(text).toContain('notes.md');
  });

  test('includes the current gate and input_mode', () => {
    const text = buildNudgeText({slug: 'abc', stage: 'requirements', inputMode: 'inline', gateOnAdvance: 'wait_for_approval'});
    expect(text).toContain('wait_for_approval');
    expect(text).toContain('inline');
  });

  test('points the agent at status.json for advancement', () => {
    const text = buildNudgeText({slug: 'abc', stage: 'implement', inputMode: 'ask_questions', gateOnAdvance: 'review_and_advance'});
    expect(text).toContain('status.json');
  });
});

// ─── safety invariants ──────────────────────────────────────────────────────

describe('RalphCore safety invariants', () => {
  test('never sends a nudge when ai_status is "waiting"', () => {
    enableRalph();
    writeStatus('my-slug', {});
    const t0 = Date.now();
    const wt = makeWorktree({ai_status: 'waiting'});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => t0});
    core.sampleOnce();
    // fast-forward way past the idle threshold
    (core as any).now = () => t0 + 10 * 60 * 1000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(0);
  });

  test('never sends a nudge when ai_status is "working"', () => {
    enableRalph();
    writeStatus('my-slug', {});
    const t0 = Date.now();
    const wt = makeWorktree({ai_status: 'working'});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => t0 + 10 * 60 * 1000});
    core.sampleOnce();
    expect(tmux.sent.length).toBe(0);
  });

  test('never sends a nudge when status.json has a fresh is_waiting_for_user=true', () => {
    enableRalph();
    writeStatus('my-slug', {is_waiting_for_user: true, brief_description: 'waiting on user'});
    const t0 = Date.now();
    const wt = makeWorktree({ai_status: 'idle'});
    // First sample seeds the stall window; second advances past the threshold.
    let now = t0;
    const {core, tmux} = buildCore({worktrees: [wt], now: () => now});
    core.sampleOnce();
    now = t0 + 10 * 60 * 1000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(0);
  });

  test('never sends a nudge when ralph is disabled for the project', () => {
    saveRalphConfig(projectPath, {enabled: false, idleThresholdMs: 60_000, maxNudgesPerStage: 3});
    writeStatus('my-slug', {});
    const t0 = Date.now();
    let now = t0;
    const wt = makeWorktree({ai_status: 'idle'});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => now});
    core.sampleOnce();
    now = t0 + 10 * 60 * 1000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(0);
  });

  test('never sends a nudge when the tmux session is not attached', () => {
    enableRalph();
    writeStatus('my-slug', {});
    const t0 = Date.now();
    let now = t0;
    const wt = makeWorktree({ai_status: 'idle', attached: false});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => now});
    core.sampleOnce();
    now = t0 + 10 * 60 * 1000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(0);
  });
});

// ─── detection + cap + resets ───────────────────────────────────────────────

describe('RalphCore detection + cap + resets', () => {
  test('fires a nudge after sustained idle + unchanged stage', () => {
    enableRalph({idleThresholdMs: 60_000});
    writeStatus('my-slug', {});
    const t0 = Date.now();
    let now = t0;
    const wt = makeWorktree({ai_status: 'idle'});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => now});
    core.sampleOnce();
    expect(tmux.sent.length).toBe(0); // not yet past threshold
    now = t0 + 90_000; // past threshold
    core.sampleOnce();
    expect(tmux.sent.length).toBe(1);
    expect(tmux.sent[0].session).toBe('dev-proj-my-slug');
    expect(tmux.sent[0].executeCommand).toBe(true);
  });

  test('increments the counter then caps at maxNudgesPerStage', () => {
    enableRalph({idleThresholdMs: 60_000, maxNudgesPerStage: 3});
    writeStatus('my-slug', {});
    const t0 = Date.now();
    let now = t0;
    const wt = makeWorktree({ai_status: 'idle'});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => now});
    core.sampleOnce(); // seed
    for (let i = 1; i <= 5; i++) {
      now = t0 + i * 120_000;
      core.sampleOnce();
    }
    expect(tmux.sent.length).toBe(3);
    const state = core.get().worktrees['proj::my-slug'];
    expect(state.nudgesThisStage).toBe(3);
    expect(state.capped).toBe(true);
  });

  test('stage change resets the cap and nudge counter', () => {
    // Use cap=2 so the second nudge (post stage change) doesn't immediately
    // re-cap us — that would confuse the "was the counter actually reset?"
    // assertion.
    enableRalph({idleThresholdMs: 60_000, maxNudgesPerStage: 2});
    writeStatus('my-slug', {stage: 'discovery'});
    const t0 = Date.now();
    let now = t0;
    const wt = makeWorktree({ai_status: 'idle'});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => now});
    core.sampleOnce();
    now = t0 + 120_000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(1);
    // Agent advances the stage
    writeStatus('my-slug', {stage: 'requirements'});
    now = t0 + 240_000;
    core.sampleOnce(); // observes the stage change and resets
    now = t0 + 360_000;
    core.sampleOnce(); // idle window re-accrues and fires
    expect(tmux.sent.length).toBe(2);
    const state = core.get().worktrees['proj::my-slug'];
    expect(state.nudgesThisStage).toBe(1); // counter reset then incremented
    expect(state.capped).toBe(false);
  });

  test('fresh is_waiting_for_user flip resets the cap mid-stage', () => {
    enableRalph({idleThresholdMs: 60_000, maxNudgesPerStage: 1});
    writeStatus('my-slug', {});
    const t0 = Date.now();
    let now = t0;
    const wt = makeWorktree({ai_status: 'idle'});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => now});
    core.sampleOnce();
    now = t0 + 120_000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(1);
    // Agent sets is_waiting_for_user: true
    writeStatus('my-slug', {is_waiting_for_user: true, brief_description: 'reviewing'});
    now = t0 + 240_000;
    core.sampleOnce();
    const state = core.get().worktrees['proj::my-slug'];
    expect(state.capped).toBe(false);
    expect(state.nudgesThisStage).toBe(0);
  });

  test('ignores stale waiting flags (> 24h old)', () => {
    enableRalph({idleThresholdMs: 60_000});
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    writeStatus('my-slug', {is_waiting_for_user: true, brief_description: 'stale', timestamp: oldTimestamp});
    const t0 = Date.now();
    let now = t0;
    const wt = makeWorktree({ai_status: 'idle'});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => now});
    core.sampleOnce();
    now = t0 + 120_000;
    core.sampleOnce();
    // Stale flag does NOT suppress the nudge
    expect(tmux.sent.length).toBe(1);
  });

  test('nudge text names the current stage and references status.json', () => {
    enableRalph({idleThresholdMs: 60_000});
    writeStatus('my-slug', {stage: 'requirements'});
    const t0 = Date.now();
    let now = t0;
    const wt = makeWorktree({ai_status: 'idle'});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => now});
    core.sampleOnce();
    now = t0 + 120_000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(1);
    expect(tmux.sent[0].text).toContain('requirements');
    expect(tmux.sent[0].text).toContain('status.json');
    expect(tmux.sent[0].text).toContain('my-slug');
  });

  test('logs an entry for each nudge', () => {
    enableRalph({idleThresholdMs: 60_000});
    writeStatus('my-slug', {stage: 'implement'});
    const t0 = Date.now();
    let now = t0;
    const wt = makeWorktree({ai_status: 'idle'});
    const {core, logs} = buildCore({worktrees: [wt], now: () => now});
    core.sampleOnce();
    now = t0 + 120_000;
    core.sampleOnce();
    expect(logs.length).toBe(1);
    const entry = JSON.parse(logs[0]);
    expect(entry.stage).toBe('implement');
    expect(entry.nudgeNumber).toBe(1);
    expect(entry.slug).toBe('my-slug');
  });
});

// ─── full end-to-end flow (ac §38) ──────────────────────────────────────────

describe('RalphCore full fake-agent flow', () => {
  test('waiting → clear → nudge → cap → advance → reset', () => {
    enableRalph({idleThresholdMs: 60_000, maxNudgesPerStage: 2});

    // Fake agent begins the stage and marks itself waiting on the user.
    writeStatus('my-slug', {
      stage: 'requirements',
      is_waiting_for_user: true,
      brief_description: 'awaiting approval',
    });

    const t0 = Date.now();
    let now = t0;
    const wt = makeWorktree({ai_status: 'idle'});
    const {core, tmux} = buildCore({worktrees: [wt], now: () => now});

    // Sample while fresh-waiting — no nudge regardless of how long we wait.
    core.sampleOnce();
    now = t0 + 10 * 60_000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(0);

    // User responds; agent clears the waiting flag and keeps working.
    writeStatus('my-slug', {
      stage: 'requirements',
      is_waiting_for_user: false,
      brief_description: 'drafting section 2',
    });

    // Idle clock starts now. Advance just past the threshold; nudge fires.
    now = t0 + 11 * 60_000;
    core.sampleOnce(); // starts the idle window
    now = t0 + 13 * 60_000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(1);

    // Another idle window elapses; second nudge fires and hits the cap.
    now = t0 + 15 * 60_000;
    core.sampleOnce();
    now = t0 + 17 * 60_000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(2);
    let state = core.get().worktrees['proj::my-slug'];
    expect(state.capped).toBe(true);

    // Further idle time while capped produces no more nudges.
    now = t0 + 30 * 60_000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(2);

    // Agent advances the stage (or a human does via moveItem, same effect).
    writeStatus('my-slug', {
      stage: 'implement',
      is_waiting_for_user: false,
      brief_description: 'writing RalphCore',
    });
    now = t0 + 31 * 60_000;
    core.sampleOnce(); // observes stage change, resets cap + counter
    state = core.get().worktrees['proj::my-slug'];
    expect(state.capped).toBe(false);
    expect(state.nudgesThisStage).toBe(0);

    // New idle window; nudge fires cleanly on the new stage.
    now = t0 + 34 * 60_000;
    core.sampleOnce();
    expect(tmux.sent.length).toBe(3);
    expect(tmux.sent[2].text).toContain('implement');
  });
});
