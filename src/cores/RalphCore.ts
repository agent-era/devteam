import path from 'node:path';
import fs from 'node:fs';
import {CoreBase} from '../engine/core-types.js';
import {TmuxService} from '../services/TmuxService.js';
import {TrackerService, TrackerStage} from '../services/TrackerService.js';
import {WorktreeInfo} from '../models.js';
import {startIntervalIfEnabled} from '../shared/utils/intervals.js';
import {logError, logInfo} from '../shared/utils/logger.js';

export interface RalphConfig {
  enabled: boolean;
  idleThresholdMs: number;
  maxNudgesPerStage: number;
}

export const DEFAULT_RALPH_CONFIG: RalphConfig = {
  enabled: false,
  idleThresholdMs: 3 * 60 * 1000,
  maxNudgesPerStage: 3,
};

// Minimum gap between sampling cycles. Keeps the loop cheap and aligned with
// the convention noted in auto-memory (poll intervals ≥ 60s).
const SAMPLE_INTERVAL_MS = 60_000;

export interface RalphWorktreeState {
  project: string;
  slug: string;
  // First timestamp in an unbroken run of ai_status === 'idle'. null when
  // the agent is not currently idle.
  idleSince: number | null;
  // Stage value observed on the previous sample. null before the first sample.
  lastStage: TrackerStage | null;
  // Nudges sent during the current stage. Reset on stage change or on a
  // fresh is_waiting_for_user flip.
  nudgesThisStage: number;
  // Timestamp of the most recent nudge sent to this worktree.
  lastNudgeAt: number | null;
  // True once nudgesThisStage has reached the cap and the worktree is
  // flagged "needs attention" until the stage advances.
  capped: boolean;
}

type State = {
  // Keyed by `${project}::${slug}` so look-ups stay cheap.
  worktrees: Record<string, RalphWorktreeState>;
};

export interface RalphDependencies {
  tracker: TrackerService;
  tmux: TmuxService;
  // Lazy producer for the current worktree snapshot from WorktreeCore. Kept as
  // a function so RalphCore doesn't depend on WorktreeCore's lifecycle.
  getWorktrees: () => readonly WorktreeInfo[];
  getProjectPath: (project: string) => string;
  // Injection points for testability.
  now?: () => number;
  logger?: (line: string) => void;
}

// Per-project ralph config persists at <projectPath>/tracker/ralph.json.
export function ralphConfigPath(projectPath: string): string {
  return path.join(projectPath, 'tracker', 'ralph.json');
}

export function loadRalphConfig(projectPath: string): RalphConfig {
  try {
    const raw = fs.readFileSync(ralphConfigPath(projectPath), 'utf8');
    const parsed = JSON.parse(raw) as Partial<RalphConfig>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_RALPH_CONFIG.enabled,
      idleThresholdMs:
        typeof parsed.idleThresholdMs === 'number' && parsed.idleThresholdMs > 0
          ? parsed.idleThresholdMs
          : DEFAULT_RALPH_CONFIG.idleThresholdMs,
      maxNudgesPerStage:
        typeof parsed.maxNudgesPerStage === 'number' && parsed.maxNudgesPerStage >= 0
          ? parsed.maxNudgesPerStage
          : DEFAULT_RALPH_CONFIG.maxNudgesPerStage,
    };
  } catch {
    return {...DEFAULT_RALPH_CONFIG};
  }
}

export function saveRalphConfig(projectPath: string, config: RalphConfig): void {
  const dir = path.dirname(ralphConfigPath(projectPath));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(ralphConfigPath(projectPath), JSON.stringify(config, null, 2));
}

// Build the stage-specific nudge text. The agent pastes this back into its
// own context, so it's written in the second person, names the stage guide
// path, and references the status.json protocol it should be maintaining.
export function buildNudgeText(opts: {
  slug: string;
  stage: TrackerStage;
  inputMode: string;
  gateOnAdvance: string;
}): string {
  const outputFile =
    opts.stage === 'discovery' ? 'notes.md'
    : opts.stage === 'requirements' ? 'requirements.md'
    : opts.stage === 'implement' ? 'implementation.md'
    : opts.stage === 'cleanup' ? 'implementation.md'
    : '—';
  const stageFile = `tracker/stages/${stageFileNumber(opts.stage)}-${opts.stage}.md`;
  return [
    `[ralph] You're still in stage "${opts.stage}" for ${opts.slug} and appear idle.`,
    `Re-read ${stageFile} (gate: ${opts.gateOnAdvance}; input_mode: ${opts.inputMode}).`,
    `Expected output: ${outputFile}. When work is done, advance by updating tracker/items/${opts.slug}/status.json (canonical) then the index.`,
    `If you're blocked, set is_waiting_for_user: true in status.json with a brief_description — or use ask_questions if that's your input_mode. Otherwise keep going.`,
  ].join(' ');
}

function stageFileNumber(stage: TrackerStage): number {
  switch (stage) {
    case 'backlog': return 1;
    case 'discovery': return 2;
    case 'requirements': return 3;
    case 'implement': return 4;
    case 'cleanup': return 5;
    default: return 0;
  }
}

function stateKey(project: string, slug: string): string {
  return `${project}::${slug}`;
}

export class RalphCore implements CoreBase<State> {
  private state: State = {worktrees: {}};
  private listeners = new Set<(s: Readonly<State>) => void>();
  private timers: Array<() => void> = [];
  private tracker: TrackerService;
  private tmux: TmuxService;
  private getWorktrees: () => readonly WorktreeInfo[];
  private getProjectPath: (project: string) => string;
  private now: () => number;
  private log: (line: string) => void;

  constructor(deps: RalphDependencies) {
    this.tracker = deps.tracker;
    this.tmux = deps.tmux;
    this.getWorktrees = deps.getWorktrees;
    this.getProjectPath = deps.getProjectPath;
    this.now = deps.now ?? (() => Date.now());
    this.log = deps.logger ?? ((line: string) => {
      try {
        const logPath = path.join(process.cwd(), 'logs', 'ralph.log');
        fs.mkdirSync(path.dirname(logPath), {recursive: true});
        fs.appendFileSync(logPath, line + '\n');
      } catch {
        // silent — logging must never crash the loop
      }
    });
  }

  get(): Readonly<State> { return this.state; }
  subscribe(fn: (s: Readonly<State>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  start(): void {
    const clear = startIntervalIfEnabled(() => {
      try { this.sampleOnce(); } catch (err) { logError('ralph sample failed', err); }
    }, SAMPLE_INTERVAL_MS);
    this.timers.push(clear);
  }
  stop(): void {
    for (const t of this.timers) t?.();
    this.timers = [];
  }

  // Exposed for tests and for the app to drive an immediate sample after a
  // settings change. Runs one pass across every known worktree and fires any
  // nudges that the guard conditions allow.
  sampleOnce(): void {
    const worktrees = this.getWorktrees();
    const nowMs = this.now();
    let changed = false;

    for (const wt of worktrees) {
      const key = stateKey(wt.project, wt.feature);
      const cur = this.state.worktrees[key] ?? this.blankState(wt.project, wt.feature);
      const next = this.sampleWorktree(wt, cur, nowMs);
      if (!shallowEqual(cur, next)) {
        this.state.worktrees[key] = next;
        changed = true;
      } else if (!this.state.worktrees[key]) {
        this.state.worktrees[key] = cur;
        changed = true;
      }
    }

    if (changed) this.emit();
  }

  private blankState(project: string, slug: string): RalphWorktreeState {
    return {
      project,
      slug,
      idleSince: null,
      lastStage: null,
      nudgesThisStage: 0,
      lastNudgeAt: null,
      capped: false,
    };
  }

  private sampleWorktree(
    wt: WorktreeInfo,
    prev: RalphWorktreeState,
    nowMs: number,
  ): RalphWorktreeState {
    const projectPath = this.getProjectPath(wt.project);
    if (!projectPath) return prev;

    const config = loadRalphConfig(projectPath);
    const stage = this.tracker.getItemStage(projectPath, wt.feature);
    const status = this.tracker.getItemStatus(projectPath, wt.feature);
    const aiStatus = wt.session?.ai_status ?? 'not_running';
    const sessionName = wt.session?.session_name;

    // Track stage for reset semantics. Any stage change clears the cap and
    // the nudge counter — the agent has made real progress.
    let nudgesThisStage = prev.nudgesThisStage;
    let capped = prev.capped;
    let idleSince = prev.idleSince;
    const stageChanged = prev.lastStage !== null && prev.lastStage !== stage;
    if (stageChanged) {
      nudgesThisStage = 0;
      capped = false;
      idleSince = null;
    }

    // Any fresh waiting flag also resets the cap — the agent explicitly said
    // it's waiting on a human, so any prior stuck-ness is moot.
    const fresh = status && status.is_waiting_for_user && !this.tracker.isItemStatusStale(status, new Date(nowMs));
    if (fresh && (prev.idleSince !== null || prev.nudgesThisStage > 0 || prev.capped)) {
      nudgesThisStage = 0;
      capped = false;
      idleSince = null;
    }

    // Track the idle run.
    if (aiStatus === 'idle') {
      if (idleSince === null) idleSince = nowMs;
    } else {
      idleSince = null;
    }

    // Build the next state *before* the nudge decision so we can short-circuit
    // cleanly if any guard fails.
    const next: RalphWorktreeState = {
      project: wt.project,
      slug: wt.feature,
      idleSince,
      lastStage: stage,
      nudgesThisStage,
      lastNudgeAt: prev.lastNudgeAt,
      capped,
    };

    // ── nudge guards ─────────────────────────────────────────────────────────
    if (!config.enabled) return next;
    if (!sessionName || !wt.session?.attached) return next;
    if (aiStatus === 'working' || aiStatus === 'waiting') return next;
    if (aiStatus !== 'idle') return next;
    if (idleSince === null || nowMs - idleSince < config.idleThresholdMs) return next;
    if (fresh) return next;
    if (stage === 'archive') return next;
    if (nudgesThisStage >= config.maxNudgesPerStage) {
      next.capped = true;
      return next;
    }

    // Stage has to have been unchanged for the idle window as well. We proxy
    // this via lastStage — if the stage hasn't changed since the previous
    // sample *and* we've been idle long enough, that's a stall.
    if (prev.lastStage !== null && prev.lastStage !== stage) return next;

    // Fire the nudge. `stage !== 'archive'` has already been guarded above,
    // so stage is Exclude<TrackerStage, 'archive'> here.
    const stageSettings = this.tracker.loadStagesConfig(projectPath);
    const settings = stageSettings?.[stage as Exclude<TrackerStage, 'archive'>]?.settings ?? {};
    const nudgeText = buildNudgeText({
      slug: wt.feature,
      stage,
      inputMode: settings['input_mode'] ?? 'ask_questions',
      gateOnAdvance: settings['gate_on_advance'] ?? 'none',
    });

    try {
      this.tmux.sendText(sessionName, nudgeText, {executeCommand: true});
    } catch (err) {
      logError('ralph: failed to send nudge', err);
      return next;
    }

    next.nudgesThisStage = nudgesThisStage + 1;
    next.lastNudgeAt = nowMs;
    next.capped = next.nudgesThisStage >= config.maxNudgesPerStage;
    next.idleSince = null; // reset the idle clock so we don't double-fire

    this.log(JSON.stringify({
      timestamp: new Date(nowMs).toISOString(),
      project: wt.project,
      slug: wt.feature,
      stage,
      nudgeNumber: next.nudgesThisStage,
      idleMs: nowMs - (idleSince ?? nowMs),
    }));
    logInfo('ralph nudged worktree', {project: wt.project, slug: wt.feature, stage, nudge: next.nudgesThisStage});

    return next;
  }

  private emit(): void {
    const snapshot: State = {worktrees: {...this.state.worktrees}};
    for (const listener of this.listeners) listener(snapshot);
  }
}

function shallowEqual(a: RalphWorktreeState, b: RalphWorktreeState): boolean {
  return a.project === b.project
    && a.slug === b.slug
    && a.idleSince === b.idleSince
    && a.lastStage === b.lastStage
    && a.nudgesThisStage === b.nudgesThisStage
    && a.lastNudgeAt === b.lastNudgeAt
    && a.capped === b.capped;
}
