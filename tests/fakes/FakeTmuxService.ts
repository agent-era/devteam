import {TmuxService} from '../../src/services/TmuxService.js';
import {SessionInfo, AIStatus, AITool} from '../../src/models.js';
import {SESSION_PREFIX} from '../../src/constants.js';
import {FakeAIToolService} from './FakeAIToolService.js';
import {memoryStore} from './stores.js';

export class FakeTmuxService extends TmuxService {
  private sentKeys: Array<{session: string, keys: string[]}> = [];
  private sessions = new Map<string, SessionInfo>();

  constructor() {
    super(new FakeAIToolService());
  }
  
  sessionName(project: string, feature: string): string {
    return `${SESSION_PREFIX}${project}-${feature}`;
  }

  shellSessionName(project: string, feature: string): string {
    return `${this.sessionName(project, feature)}-shell`;
  }

  hasSession(session: string): boolean {
    return this.sessions.has(session) || memoryStore.sessions.has(session);
  }

  async listSessions(): Promise<string[]> {
    const set = new Set<string>([...this.sessions.keys(), ...memoryStore.sessions.keys()]);
    return Array.from(set.values());
  }

  async capturePane(session: string): Promise<string> {
    const sessionInfo = this.sessions.get(session) || memoryStore.sessions.get(session);
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

  async getAIStatus(session: string): Promise<{tool: AITool, status: AIStatus}> {
    const sessionInfo = this.sessions.get(session) || memoryStore.sessions.get(session);
    if (!sessionInfo) return {tool: 'none', status: 'not_running'};
    
    return {
      tool: sessionInfo.ai_tool || 'claude',
      status: sessionInfo.ai_status || sessionInfo.claude_status || 'not_running'
    };
  }


  killSession(session: string): string {
    const d1 = this.sessions.delete(session);
    const d2 = memoryStore.sessions.delete(session);
    return (d1 || d2) ? 'Session killed' : 'No such session';
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
  createSession(sessionName: string, cwd: string, autoExit: boolean = false): void {
    const sessionInfo = new SessionInfo({
      session_name: sessionName,
      attached: true,
      claude_status: 'active'
    });
    this.sessions.set(sessionName, sessionInfo);
    try { memoryStore.sessions.set(sessionName, sessionInfo); } catch {}
    if (autoExit) {
      // Mock setting remain-on-exit off
      this.recordSentKeys(sessionName, ['remain-on-exit', 'off']);
    }
  }

  createSessionWithCommand(sessionName: string, cwd: string, command: string, autoExit: boolean = true): void {
    // Detect AI tool from command
    let aiTool: AITool = 'none';
    let aiStatus: AIStatus = 'idle';
    
    if (command.includes('claude')) {
      aiTool = 'claude';
    } else if (command.includes('codex')) {
      aiTool = 'codex';
    } else if (command.includes('gemini')) {
      aiTool = 'gemini';
    } else {
      aiStatus = 'active';
    }
    
    const sessionInfo = new SessionInfo({
      session_name: sessionName,
      attached: true,
      ai_tool: aiTool,
      ai_status: aiStatus,
      claude_status: aiTool === 'claude' ? aiStatus : 'active' // Backward compatibility
    });
    this.sessions.set(sessionName, sessionInfo);
    try { memoryStore.sessions.set(sessionName, sessionInfo); } catch {}
    if (autoExit) {
      // Mock setting remain-on-exit off
      this.recordSentKeys(sessionName, ['remain-on-exit', 'off']);
    }
    this.recordSentKeys(sessionName, ['command', command]);
  }

  createTestSessionWithTool(project: string, feature: string, tool: AITool, status: AIStatus = 'idle'): string | null {
    const sessionName = this.sessionName(project, feature);
    const sessionInfo = new SessionInfo({
      session_name: sessionName,
      attached: true,
      ai_tool: tool,
      ai_status: status
    });
    this.sessions.set(sessionName, sessionInfo);
    try { memoryStore.sessions.set(sessionName, sessionInfo); } catch {}
    return sessionName;
  }

  sendText(session: string, text: string, options: {
    addNewline?: boolean;
    executeCommand?: boolean;
  } = {}): void {
    const { addNewline = false, executeCommand = false } = options;
    
    if (executeCommand) {
      this.recordSentKeys(session, [text, 'C-m']);
    } else if (addNewline) {
      this.recordSentKeys(session, [text + '\n']);
    } else {
      this.recordSentKeys(session, [text]);
    }
  }

  sendMultilineText(session: string, lines: string[], options: {
    endWithAltEnter?: boolean;
    endWithExecute?: boolean;
  } = {}): void {
    const { endWithAltEnter = false, endWithExecute = false } = options;
    
    lines.forEach((line) => {
      this.recordSentKeys(session, [line]);
      if (endWithAltEnter) {
        this.recordSentKeys(session, ['Escape', 'Enter']);
      }
    });
    
    if (endWithExecute) {
      this.recordSentKeys(session, ['C-m']);
    }
  }

  sendSpecialKeys(session: string, ...keys: string[]): void {
    this.recordSentKeys(session, keys);
  }

  attachSessionInteractive(sessionName: string): void {
    // In tests, just mark as attached
    const sessionInfo = this.sessions.get(sessionName) || memoryStore.sessions.get(sessionName);
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
    const sessionInfo = this.sessions.get(session) || memoryStore.sessions.get(session);
    if (!sessionInfo) return '';
    return '0.0 bash\n1.0 claude'; // Mock pane list
  }

  // Test helpers
  createTestSession(project: string, feature: string, aiStatus: AIStatus = 'not_running'): string | null {
    // Check if session creation should fail (for error testing)
    if ((global as any).__mockTmuxShouldFail) {
      return null;
    }

    const sessionName = this.sessionName(project, feature);
    const sessionInfo = new SessionInfo({
      session_name: sessionName,
      attached: aiStatus !== 'not_running',
      ai_status: aiStatus,
      claude_status: aiStatus, // Keep for backward compatibility in models
    });
    
    this.sessions.set(sessionName, sessionInfo);
    try { memoryStore.sessions.set(sessionName, sessionInfo); } catch {}
    return sessionName;
  }

  createShellSession(project: string, feature: string): string {
    const sessionName = this.shellSessionName(project, feature);
    const sessionInfo = new SessionInfo({
      session_name: sessionName,
      attached: true,
      claude_status: 'active', // Shell sessions are always active
    });
    
    this.sessions.set(sessionName, sessionInfo);
    try { memoryStore.sessions.set(sessionName, sessionInfo); } catch {}
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
    
    this.sessions.set(sessionName, sessionInfo);
    try { memoryStore.sessions.set(sessionName, sessionInfo); } catch {}
    return sessionName;
  }


  // Helper methods for testing AI tools
  setAITool(session: string, tool: AITool): void {
    const sessionInfo = this.sessions.get(session) || memoryStore.sessions.get(session);
    if (sessionInfo) {
      sessionInfo.ai_tool = tool;
      this.sessions.set(session, sessionInfo);
      try { memoryStore.sessions.set(session, sessionInfo); } catch {}
    }
  }

  setAIStatus(session: string, status: AIStatus): void {
    const sessionInfo = (this.sessions.get(session) || memoryStore.sessions.get(session)) as SessionInfo | undefined;
    if (sessionInfo) {
      sessionInfo.ai_status = status;
      // Also update claude_status for backward compatibility
      if (sessionInfo.ai_tool === 'claude' || !sessionInfo.ai_tool) {
        sessionInfo.claude_status = status;
      }
      this.sessions.set(session, sessionInfo);
      try { memoryStore.sessions.set(session, sessionInfo); } catch {}
    }
  }

  getSessionInfo(session: string): SessionInfo | undefined {
    return this.sessions.get(session) || memoryStore.sessions.get(session);
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
