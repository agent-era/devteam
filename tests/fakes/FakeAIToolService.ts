import {AIToolService} from '../../src/services/AIToolService.js';
import {AIStatus, AITool} from '../../src/models.js';
import {AI_TOOLS} from '../../src/constants.js';
import {memoryStore} from './stores.js';

export class FakeAIToolService extends AIToolService {
  private launchedSessions: Array<{tool: AITool, session: string, cwd: string}> = [];
  private switchedSessions: Array<{tool: AITool, session: string}> = [];

  /**
   * Fake implementation with simple, predictable logic for pane detection
   */
  isAIPaneCommand(command: string): boolean {
    const lower = command.toLowerCase();
    if (lower.includes('claude') || lower.includes('codex') || lower.includes('gemini')) return true;
    if (lower.includes('node')) return true; // both codex and gemini use node
    return false;
  }

  /**
   * Fake implementation that uses the memory store to determine tools
   */
  async detectAllSessionAITools(): Promise<Map<string, AITool>> {
    const toolsMap = new Map<string, AITool>();
    
    // Use actual session data from memory store
    for (const [sessionName, sessionInfo] of memoryStore.sessions.entries()) {
      if (sessionName.startsWith('dev-')) {
        // Use only the AI tool stored in session info
        const tool: AITool = sessionInfo.ai_tool || 'none';
        toolsMap.set(sessionName, tool);
      }
    }
    
    return toolsMap;
  }

  /**
   * Fake implementation with simple pattern matching
   */
  getStatusForTool(text: string, tool: AITool): AIStatus {
    if (tool === 'none') return 'not_running';
    
    const lowerText = text.toLowerCase();
    
    // Simple fake patterns - easier to predict in tests
    if (lowerText.includes('working') || lowerText.includes('interrupt') || lowerText.includes('cancel')) {
      return 'working';
    }
    
    if (lowerText.includes('waiting') || lowerText.includes('choose') || lowerText.includes('select')) {
      return 'waiting';
    }
    
    // Tool-specific simple rules
    switch (tool) {
      case 'codex':
        if (!lowerText.includes('send')) return 'waiting';
        break;
      case 'gemini':
        if (lowerText.includes('user confirmation')) return 'waiting';
        break;
      case 'claude':
        if (lowerText.includes('❯') && /\d+\./.test(text)) return 'waiting';
        break;
    }
    
    return 'idle';
  }

  /**
   * Override launchTool to track launches instead of actually running commands
   */
  launchTool(tool: AITool, sessionName: string, cwd: string): void {
    if (tool === 'none') return;
    
    this.launchedSessions.push({tool, session: sessionName, cwd});
  }

  /**
   * Override switchTool to track switches instead of actually running commands
   */
  switchTool(tool: AITool, sessionName: string): void {
    if (tool === 'none') return;
    
    this.switchedSessions.push({tool, session: sessionName});
  }

  // Test helper methods

  /**
   * Get all launched sessions for testing
   */
  getLaunchedSessions(): Array<{tool: AITool, session: string, cwd: string}> {
    return [...this.launchedSessions];
  }

  /**
   * Get all switched sessions for testing
   */
  getSwitchedSessions(): Array<{tool: AITool, session: string}> {
    return [...this.switchedSessions];
  }

  /**
   * Check if a specific session was launched with a tool
   */
  wasSessionLaunched(sessionName: string, tool?: AITool): boolean {
    return this.launchedSessions.some(launch => 
      launch.session === sessionName && (tool === undefined || launch.tool === tool)
    );
  }

  /**
   * Check if a specific session had its tool switched
   */
  wasSessionSwitched(sessionName: string, tool?: AITool): boolean {
    return this.switchedSessions.some(switchOp => 
      switchOp.session === sessionName && (tool === undefined || switchOp.tool === tool)
    );
  }

  /**
   * Clear all tracking for fresh test state
   */
  clearTrackingData(): void {
    this.launchedSessions = [];
    this.switchedSessions = [];
  }

  /**
   * Create a test session with specific AI tool for consistent testing
   */
  createTestSessionWithTool(sessionName: string, tool: AITool, status: AIStatus = 'idle'): void {
    const sessionInfo = memoryStore.sessions.get(sessionName);
    if (sessionInfo) {
      sessionInfo.ai_tool = tool;
      sessionInfo.ai_status = status;
    } else {
      // Create new session info if it doesn't exist
      memoryStore.sessions.set(sessionName, {
        session_name: sessionName,
        attached: true,
        ai_tool: tool,
        ai_status: status,
        claude_status: tool === 'claude' ? status : 'not_running'
      } as any);
    }
  }

  /**
   * Set up typical test data in memory store for predictable behavior
   */
  setupTestSessions(): void {
    this.createTestSessionWithTool('dev-project1-feature1', 'claude', 'idle');
    this.createTestSessionWithTool('dev-project2-feature2', 'codex', 'working');
    this.createTestSessionWithTool('dev-project3-feature3', 'gemini', 'waiting');
  }
}
