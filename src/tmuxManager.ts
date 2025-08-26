import {commandExitCode, runCommandQuick} from './utils.js';
import {SESSION_PREFIX, CLAUDE_PATTERNS, SYMBOL_IDLE, SYMBOL_WAITING, SYMBOL_WORKING, SYMBOL_FAILED} from './constants.js';

export class TmuxManager {
  constructor() {}

  sessionName(project: string, feature: string): string {
    return `${SESSION_PREFIX}${project}-${feature}`;
  }

  shellSessionName(project: string, feature: string): string {
    return `${this.sessionName(project, feature)}-shell`;
  }

  hasSession(session: string): boolean {
    // Exact match with =session
    const code = commandExitCode(['tmux', 'has-session', '-t', `=${session}`]);
    return code === 0;
  }

  listSessions(): string[] {
    const out = runCommandQuick(['tmux', 'list-sessions', '-F', '#S']);
    if (!out) return [];
    return out.split('\n').filter(Boolean);
  }

  private findClaudePaneTarget(session: string): string | null {
    // Prefer the pane where claude (or node running Claude) is active
    const panes = runCommandQuick(['tmux', 'list-panes', '-t', `=${session}`, '-F', '#{window_index}.#{pane_index} #{pane_current_command}']);
    if (!panes) return `${session}:0.0`;
    const lines = panes.split('\n').filter(Boolean);
    for (const line of lines) {
      const [idx, ...rest] = line.split(' ');
      const cmd = rest.join(' ').toLowerCase();
      if (cmd.includes('claude') || cmd.includes('node') || cmd.includes('codex')) return `${session}:${idx}`;
    }
    // Fallback to first pane
    const firstIdx = lines[0]?.split(' ')[0] || '0.0';
    return `${session}:${firstIdx}`;
  }

  capturePane(session: string): string {
    const target = this.findClaudePaneTarget(session) || `${session}:0.0`;
    const out = runCommandQuick(['tmux', 'capture-pane', '-p', '-t', target, '-S', '-50']);
    return out || '';
  }

  getClaudeStatus(session: string): string {
    const text = this.capturePane(session);
    if (!text) return 'not_running';
    const lower = text.toLowerCase();
    if (typeof CLAUDE_PATTERNS.working === 'string' && lower.includes(CLAUDE_PATTERNS.working)) return 'working';
    // Waiting if prompt symbol present and numbered options like "1. ..."
    const [promptSymbol, pattern] = CLAUDE_PATTERNS.waiting_numbered as unknown as [string, string];
    // Only consider the bottom region (already limited by -S -50)
    const waiting = text.includes(promptSymbol) && new RegExp(pattern, 'm').test(text);
    if (waiting) return 'waiting';
    const [promptStart, promptEnd] = CLAUDE_PATTERNS.idle_prompt as unknown as [string, string];
    const idle = text.includes(promptStart) && text.trim().endsWith(promptEnd);
    if (idle) return 'idle';
    // Fallback idle markers for other CLIs (e.g., GPT Codex)
    try {
      // Static import to avoid await in non-async method
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {ALT_IDLE_MARKERS} = require('./constants.js');
      if (ALT_IDLE_MARKERS && ALT_IDLE_MARKERS.some((re: RegExp) => re.test(text))) return 'idle';
    } catch {}
    return 'active';
  }

  killSession(session: string) {
    return runCommandQuick(['tmux', 'kill-session', '-t', session]);
  }

  cleanupOrphanedSessions(validWorktrees: string[]) {
    const sessions = this.listSessions();
    const devSessions = sessions.filter((s) => s.startsWith(SESSION_PREFIX));
    for (const s of devSessions) {
      const suffix = s.slice(SESSION_PREFIX.length);
      if (suffix.endsWith('-shell')) continue;
      const has = validWorktrees.some((wt) => wt.includes(suffix));
      if (!has) {
        this.killSession(s);
      }
    }
  }
}
