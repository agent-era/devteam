import {TmuxService, ClaudeStatus} from '../../src/services/TmuxService.js';
import {SessionInfo} from '../../src/models.js';
import {memoryStore} from './stores.js';
import {SESSION_PREFIX} from '../../src/constants.js';

export class FakeTmuxService extends TmuxService {
  sessionName(project: string, feature: string): string {
    return `${SESSION_PREFIX}${project}-${feature}`;
  }

  shellSessionName(project: string, feature: string): string {
    return `${this.sessionName(project, feature)}-shell`;
  }

  hasSession(session: string): boolean {
    return memoryStore.sessions.has(session);
  }

  listSessions(): string[] {
    return Array.from(memoryStore.sessions.keys());
  }

  capturePane(session: string): string {
    const sessionInfo = memoryStore.sessions.get(session);
    if (!sessionInfo) return '';

    // Simulate different tmux pane outputs based on Claude status
    switch (sessionInfo.claude_status) {
      case 'working':
        return 'Claude is working on your request...\n[Working]';
      
      case 'waiting':
        return 'What would you like me to help you with?\n\n1. Write code\n2. Debug issue\n3. Review changes\n>';
      
      case 'idle':
        return 'Ready to help! Type your request.\n$>';
      
      case 'active':
        return 'user@machine:~/project$ ';
      
      default:
        return '';
    }
  }

  getClaudeStatus(session: string): ClaudeStatus {
    const sessionInfo = memoryStore.sessions.get(session);
    if (!sessionInfo) return 'not_running';
    
    return sessionInfo.claude_status as ClaudeStatus;
  }

  killSession(session: string): string {
    const deleted = memoryStore.sessions.delete(session);
    return deleted ? 'Session killed' : 'No such session';
  }

  cleanupOrphanedSessions(validWorktrees: string[]): void {
    const sessions = this.listSessions();
    const devSessions = sessions.filter((s) => s.startsWith(SESSION_PREFIX));
    
    for (const session of devSessions) {
      if (this.shouldPreservSession(session, validWorktrees)) continue;
      this.killSession(session);
    }
  }

  // Test helpers
  createSession(project: string, feature: string, claudeStatus: ClaudeStatus = 'not_running'): string {
    const sessionName = this.sessionName(project, feature);
    const sessionInfo = new SessionInfo({
      session_name: sessionName,
      attached: claudeStatus !== 'not_running',
      claude_status: claudeStatus,
    });
    
    memoryStore.sessions.set(sessionName, sessionInfo);
    return sessionName;
  }

  createShellSession(project: string, feature: string): string {
    const sessionName = this.shellSessionName(project, feature);
    const sessionInfo = new SessionInfo({
      session_name: sessionName,
      attached: true,
      claude_status: 'active', // Shell sessions are always active
    });
    
    memoryStore.sessions.set(sessionName, sessionInfo);
    return sessionName;
  }

  updateClaudeStatus(session: string, status: ClaudeStatus): void {
    const sessionInfo = memoryStore.sessions.get(session);
    if (sessionInfo) {
      sessionInfo.claude_status = status;
      sessionInfo.attached = status !== 'not_running';
      memoryStore.sessions.set(session, sessionInfo);
    }
  }

  // Private helper methods (same logic as real service)
  private shouldPreservSession(session: string, validWorktrees: string[]): boolean {
    const suffix = session.slice(SESSION_PREFIX.length);
    
    // Always preserve shell sessions
    if (suffix.endsWith('-shell')) return true;
    
    // Check if there's a matching worktree
    return validWorktrees.some((wt) => wt.includes(suffix));
  }
}