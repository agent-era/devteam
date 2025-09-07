import {runCommandQuickAsync, runCommand} from '../shared/utils/commandExecutor.js';
import {AI_TOOLS} from '../constants.js';
import {AIStatus, AITool} from '../models.js';

export class AIToolService {
  /**
   * Get tool name for display
   */
  getToolName(tool: AITool): string {
    if (tool === 'none') return 'None';
    return AI_TOOLS[tool].name;
  }
  /**
   * Determine if a pane's current command indicates an AI tool is running.
   * This is a coarse boolean used only for selecting a likely AI pane.
   */
  isAIPaneCommand(command: string): boolean {
    const lower = command.toLowerCase();
    return Object.values(AI_TOOLS).some(cfg =>
      cfg.processPatterns.some(p => lower.includes(p))
    );
  }

  /**
   * Detect AI tools across all sessions in a single batch operation
   */
  async detectAllSessionAITools(): Promise<Map<string, AITool>> {
    const toolsMap = new Map<string, AITool>();
    
    // Get all dev- sessions with their PIDs in one command
    const output = await runCommandQuickAsync(['tmux', 'list-panes', '-a', '-F', '#{session_name}:#{pane_pid}']);
    if (!output) return toolsMap;
    
    // Parse session:pid pairs for dev- sessions only
    const sessionPids: Array<{session: string, pid: string}> = [];
    const lines = output.split('\n').filter(Boolean);
    for (const line of lines) {
      const [session, pid] = line.split(':');
      if (session && pid && session.startsWith('dev-')) {
        sessionPids.push({session, pid});
      }
    }
    
    // Batch get all process args with a single ps command
    if (sessionPids.length > 0) {
      const pids = sessionPids.map(sp => sp.pid).join(',');
      const psOutput = await runCommandQuickAsync(['ps', '-p', pids, '-o', 'pid=', '-o', 'args=']);
      
      if (psOutput) {
        const psLines = psOutput.split('\n').filter(Boolean);
        for (const psLine of psLines) {
          const match = psLine.match(/^\s*(\d+)\s+(.+)$/);
          if (match) {
            const [, pid, args] = match;
            const sessionInfo = sessionPids.find(sp => sp.pid === pid);
            if (sessionInfo) {
              const tool = this.detectToolFromArgs(args);
              toolsMap.set(sessionInfo.session, tool);
            }
          }
        }
      }
    }
    
    return toolsMap;
  }

  /**
   * Detect AI tool from process arguments
   */
  private detectToolFromArgs(args: string): AITool {
    const argsLower = args.toLowerCase();
    
    if (argsLower.includes('/claude') || argsLower.includes('claude')) {
      return 'claude';
    }
    if (argsLower.includes('/codex') || argsLower.includes('codex')) {
      return 'codex';
    }
    if (argsLower.includes('/gemini') || argsLower.includes('gemini')) {
      return 'gemini';
    }
    
    return 'none';
  }

  /**
   * Determine AI status based on pane text content and detected tool
   */
  getStatusForTool(text: string, tool: AITool): AIStatus {
    if (tool === 'none') return 'not_running';
    
    const toolConfig = AI_TOOLS[tool];
    const patterns = toolConfig.statusPatterns;
    
    // Check in priority order: working → waiting → idle (default)
    
    // 1. Check for working state first (most specific)
    if (this.isWorking(text, patterns.working)) {
      return 'working';
    }
    
    // 2. Check for waiting states (tool-specific logic)
    if (this.isWaitingForTool(text, tool, patterns)) {
      return 'waiting';
    }
    
    // 3. Default to idle
    return 'idle';
  }

  /**
   * Check if AI tool is in working state
   */
  private isWorking(text: string, pattern: string): boolean {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }

  /**
   * Check if AI tool is waiting for user input (tool-specific logic)
   */
  private isWaitingForTool(text: string, tool: AITool, patterns: any): boolean {
    switch (tool) {
      case 'gemini':
        return text.toLowerCase().includes('waiting for user');
      
      case 'codex':
        // Codex is waiting if it does NOT have "⏎ send" (when not working)
        return !text.includes('⏎ send');
      
      case 'claude':
        return this.isWaiting(text, patterns.waiting_numbered);
      
      default:
        return false;
    }
  }

  /**
   * Check if text matches waiting pattern (prompt symbol + regex pattern)
   */
  private isWaiting(text: string, patterns: readonly [string, string]): boolean {
    const [promptSymbol, pattern] = patterns;
    return text.includes(promptSymbol) && new RegExp(pattern, 'm').test(text);
  }

  /**
   * Get available AI tools
   */
  getAvailableTools(): AITool[] {
    return Object.keys(AI_TOOLS) as AITool[];
  }

  /**
   * Get tool configuration
   */
  getToolConfig(tool: AITool) {
    if (tool === 'none') return null;
    return AI_TOOLS[tool];
  }

  /**
   * Launch an AI tool in a tmux session
   */
  launchTool(tool: AITool, sessionName: string, cwd: string): void {
    if (tool === 'none') return;
    
    const config = AI_TOOLS[tool];
    const command = config.command;
    
    // Create session with the AI tool command
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd, command]);
  }

  /**
   * Switch AI tool in an existing session
   */
  switchTool(tool: AITool, sessionName: string): void {
    if (tool === 'none') return;
    
    const config = AI_TOOLS[tool];
    const command = config.command;
    
    // Send Ctrl+C to interrupt current process, then start new tool
    runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'C-c']);
    setTimeout(() => {
      runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, command, 'C-m']);
    }, 100);
  }
}
