import {commandExitCode, runCommandQuick} from '../utils.js';
import {SESSION_PREFIX, CLAUDE_PATTERNS} from '../constants.js';

export type ClaudeStatus = 'not_running' | 'working' | 'waiting' | 'idle' | 'active';

export class TmuxService {
  sessionName(project: string, feature: string): string {
    return `${SESSION_PREFIX}${project}-${feature}`;
  }

  shellSessionName(project: string, feature: string): string {
    return `${this.sessionName(project, feature)}-shell`;
  }

  runSessionName(project: string, feature: string): string {
    return `${this.sessionName(project, feature)}-run`;
  }

  hasSession(session: string): boolean {
    const code = commandExitCode(['tmux', 'has-session', '-t', `=${session}`]);
    return code === 0;
  }

  listSessions(): string[] {
    const output = runCommandQuick(['tmux', 'list-sessions', '-F', '#S']);
    if (!output) return [];
    return output.split('\n').filter(Boolean);
  }

  capturePane(session: string): string {
    const target = this.findClaudePaneTarget(session) || `${session}:0.0`;
    const output = runCommandQuick(['tmux', 'capture-pane', '-p', '-t', target, '-S', '-50']);
    return output || '';
  }

  getClaudeStatus(session: string): ClaudeStatus {
    const text = this.capturePane(session);
    if (!text) return 'not_running';
    
    if (this.isClaudeWorking(text)) return 'working';
    if (this.isClaudeWaiting(text)) return 'waiting';
    if (this.isClaudeIdle(text)) return 'idle';
    
    return 'active';
  }

  killSession(session: string): string {
    return runCommandQuick(['tmux', 'kill-session', '-t', session]);
  }

  cleanupOrphanedSessions(validWorktrees: string[]): void {
    const sessions = this.listSessions();
    const devSessions = sessions.filter((s) => s.startsWith(SESSION_PREFIX));
    
    for (const session of devSessions) {
      if (this.shouldPreservSession(session, validWorktrees)) continue;
      this.killSession(session);
    }
  }

  // Private helper methods
  private findClaudePaneTarget(session: string): string | null {
    const panes = runCommandQuick(['tmux', 'list-panes', '-t', `=${session}`, '-F', '#{window_index}.#{pane_index} #{pane_current_command}']);
    if (!panes) return `${session}:0.0`;
    
    const lines = panes.split('\n').filter(Boolean);
    
    // Look for Claude-related processes
    for (const line of lines) {
      const [idx, ...rest] = line.split(' ');
      const command = rest.join(' ').toLowerCase();
      if (this.isClaudeProcess(command)) {
        return `${session}:${idx}`;
      }
    }
    
    // Fallback to first pane
    const firstIdx = lines[0]?.split(' ')[0] || '0.0';
    return `${session}:${firstIdx}`;
  }

  private isClaudeProcess(command: string): boolean {
    return command.includes('claude') || command.includes('node') || command.includes('codex');
  }

  private isClaudeWorking(text: string): boolean {
    const lowerText = text.toLowerCase();
    return typeof CLAUDE_PATTERNS.working === 'string' && lowerText.includes(CLAUDE_PATTERNS.working);
  }

  private isClaudeWaiting(text: string): boolean {
    const [promptSymbol, pattern] = CLAUDE_PATTERNS.waiting_numbered as unknown as [string, string];
    return text.includes(promptSymbol) && new RegExp(pattern, 'm').test(text);
  }

  private isClaudeIdle(text: string): boolean {
    const [promptStart, promptEnd] = CLAUDE_PATTERNS.idle_prompt as unknown as [string, string];
    const standardIdle = text.includes(promptStart) && text.trim().endsWith(promptEnd);
    
    if (standardIdle) return true;
    
    // Check alternative idle markers
    try {
      const {ALT_IDLE_MARKERS} = require('../constants.js');
      if (ALT_IDLE_MARKERS && ALT_IDLE_MARKERS.some((re: RegExp) => re.test(text))) {
        return true;
      }
    } catch {}
    
    return false;
  }

  private shouldPreservSession(session: string, validWorktrees: string[]): boolean {
    const suffix = session.slice(SESSION_PREFIX.length);
    
    // Always preserve shell sessions
    if (suffix.endsWith('-shell')) return true;
    
    // Check if there's a matching worktree
    return validWorktrees.some((wt) => wt.includes(suffix));
  }
}