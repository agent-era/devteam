import {TmuxService, ClaudeStatus} from '../../src/services/TmuxService.js';
import {SessionInfo} from '../../src/models.js';
import {memoryStore} from './stores.js';
import {SESSION_PREFIX} from '../../src/constants.js';

export class FakeTmuxService extends TmuxService {
  private sentKeys: Array<{session: string, keys: string[]}> = [];
  
  sessionName(project: string, feature: string): string {
    return `${SESSION_PREFIX}${project}-${feature}`;
  }

  shellSessionName(project: string, feature: string): string {
    return `${this.sessionName(project, feature)}-shell`;
  }

  hasSession(session: string): boolean {
    return memoryStore.sessions.has(session);
  }

  async listSessions(): Promise<string[]> {
    return Array.from(memoryStore.sessions.keys());
  }

  async capturePane(session: string): Promise<string> {
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

  async getClaudeStatus(session: string): Promise<ClaudeStatus> {
    const sessionInfo = memoryStore.sessions.get(session);
    if (!sessionInfo) return 'not_running';
    
    return sessionInfo.claude_status as ClaudeStatus;
  }

  killSession(session: string): string {
    const deleted = memoryStore.sessions.delete(session);
    return deleted ? 'Session killed' : 'No such session';
  }

  async cleanupOrphanedSessions(validWorktrees: string[]): Promise<void> {
    const sessions = await this.listSessions();
    const devSessions = sessions.filter((s) => s.startsWith(SESSION_PREFIX));
    
    for (const session of devSessions) {
      if (this.shouldPreserveSession(session, validWorktrees)) continue;
      this.killSession(session);
    }
  }

  // New methods from TmuxService refactor
  createSession(sessionName: string, cwd: string): void {
    const sessionInfo = new SessionInfo({
      session_name: sessionName,
      attached: true,
      claude_status: 'active'
    });
    memoryStore.sessions.set(sessionName, sessionInfo);
  }

  createSessionWithCommand(sessionName: string, cwd: string, command: string): void {
    const sessionInfo = new SessionInfo({
      session_name: sessionName,
      attached: true,
      claude_status: 'active'
    });
    memoryStore.sessions.set(sessionName, sessionInfo);
  }

  sendKeys(session: string, keys: string): void {
    this.recordSentKeys(session, [keys]);
  }

  sendKeysWithEnter(session: string, keys: string): void {
    this.recordSentKeys(session, [keys, 'C-m']);
  }

  sendKeysRaw(session: string, ...keys: string[]): void {
    this.recordSentKeys(session, keys);
  }

  attachSessionInteractive(sessionName: string): void {
    // In tests, just mark as attached
    const sessionInfo = memoryStore.sessions.get(sessionName);
    if (sessionInfo) {
      sessionInfo.attached = true;
    }
  }

  setOption(option: string, value: string): void {
    // Mock implementation - just store for testing if needed
  }

  setSessionOption(session: string, option: string, value: string): void {
    // Mock implementation - just store for testing if needed
  }

  async listPanes(session: string): Promise<string> {
    const sessionInfo = memoryStore.sessions.get(session);
    if (!sessionInfo) return '';
    return '0.0 bash\n1.0 claude'; // Mock pane list
  }

  // Test helpers
  createTestSession(project: string, feature: string, claudeStatus: ClaudeStatus = 'not_running'): string | null {
    // Check if session creation should fail (for error testing)
    if ((global as any).__mockTmuxShouldFail) {
      return null;
    }

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

  createRunSession(project: string, feature: string): string | null {
    // Check if run config exists (in real implementation)
    // For tests, we'll assume it exists if fs.existsSync returns true
    const configPath = `/fake/projects/${project}/.claude/run.json`;
    try {
      const fs = require('fs');
      if (!fs.existsSync(configPath)) {
        return null; // No config, can't create run session
      }
    } catch {
      return null;
    }

    const sessionName = `${this.sessionName(project, feature)}-run`;
    const sessionInfo = new SessionInfo({
      session_name: sessionName,
      attached: true,
      claude_status: 'active', // Run sessions are active when executing
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

  // Track sent keys for testing
  recordSentKeys(session: string, keys: string[]): void {
    this.sentKeys.push({session, keys});
  }
  
  // Get all sent keys for a session
  getSentKeys(session: string): string[][] {
    return this.sentKeys
      .filter(entry => entry.session === session)
      .map(entry => entry.keys);
  }
  
  // Clear sent keys history
  clearSentKeys(): void {
    this.sentKeys = [];
  }
  
  // Helper method to determine if a session should be preserved
  private shouldPreserveSession(session: string, validWorktrees: string[]): boolean {
    const suffix = session.slice(SESSION_PREFIX.length);
    
    // Always preserve shell sessions
    if (suffix.endsWith('-shell')) return true;
    
    // Check if there's a matching worktree
    return validWorktrees.some((wt) => wt.includes(suffix));
  }
}