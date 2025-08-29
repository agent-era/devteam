import {commandExitCode, runCommandQuick, runCommandQuickAsync} from '../utils.js';
import {SESSION_PREFIX, CLAUDE_PATTERNS} from '../constants.js';
import {logDebug} from '../shared/utils/logger.js';
import {Timer} from '../shared/utils/timing.js';

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

  async listSessions(): Promise<string[]> {
    const output = await runCommandQuickAsync(['tmux', 'list-sessions', '-F', '#S']);
    if (!output) return [];
    
    const sessions = output.split('\n').filter(Boolean);
    return sessions;
  }

  async capturePane(session: string): Promise<string> {
    const target = await this.findClaudePaneTarget(session) || `${session}:0.0`;
    const output = await runCommandQuickAsync(['tmux', 'capture-pane', '-p', '-t', target, '-S', '-50']);
    
    return output || '';
  }

  async getClaudeStatus(session: string): Promise<ClaudeStatus> {
    const text = await this.capturePane(session);
    if (!text) return 'not_running';
    
    let status: ClaudeStatus = 'active';
    if (this.isClaudeWorking(text)) status = 'working';
    else if (this.isClaudeWaiting(text)) status = 'waiting';
    else if (this.isClaudeIdle(text)) status = 'idle';
    
    return status;
  }

  killSession(session: string): string {
    return runCommandQuick(['tmux', 'kill-session', '-t', session]);
  }

  async cleanupOrphanedSessions(validWorktrees: string[]): Promise<void> {
    const sessions = await this.listSessions();
    const devSessions = sessions.filter((s) => s.startsWith(SESSION_PREFIX));
    
    for (const session of devSessions) {
      if (this.shouldPreservSession(session, validWorktrees)) continue;
      this.killSession(session);
    }
  }

  // Private helper methods
  private async findClaudePaneTarget(session: string): Promise<string | null> {
    const panes = await runCommandQuickAsync(['tmux', 'list-panes', '-t', `=${session}`, '-F', '#{window_index}.#{pane_index} #{pane_current_command}']);
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