import {runCommandQuickAsync, runCommand} from '../shared/utils/commandExecutor.js';
import {AI_TOOLS, aiLaunchCommand} from '../constants.js';
import {AIStatus, AITool} from '../models.js';
import {setLastTool} from '../shared/utils/aiSessionMemory.js';

// Matches ❯ immediately followed by a numbered option on the same line (e.g. "❯ 1. Accept")
const CLAUDE_WAITING_RE = /❯\s+\d+\.\s+\w+/m;

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
    // Use a BSD/macOS-compatible format string (pid and command on one line)
    if (sessionPids.length > 0) {
      const pids = sessionPids.map(sp => sp.pid).join(',');
      // Use Linux-friendly flags by default; switch to BSD/macOS format on darwin
      const psArgs = process.platform === 'darwin'
        ? ['ps', '-p', pids, '-o', 'pid=,command=']
        : ['ps', '-p', pids, '-o', 'pid=', '-o', 'args='];
      const psOutput = await runCommandQuickAsync(psArgs);
      
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

    // 1. Check for working state first (most specific)
    if (this.isWorking(text, toolConfig.statusPatterns.working)) {
      return 'working';
    }

    // 2. Check for waiting states (tool-specific logic)
    if (this.isWaitingForTool(text, tool)) {
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
  private isWaitingForTool(text: string, tool: AITool): boolean {
    const lower = text.toLowerCase();
    switch (tool) {
      case 'gemini':
        return lower.includes('waiting for user');

      case 'codex':
        // Codex uses the block cursor for interactive prompts; idle restores the send hint.
        return text.includes('▌') && !text.includes('⏎ send');

      case 'claude':
        // CLAUDE_WAITING_RE requires ❯ and the numbered option on the same line, preventing
        // false positives from scrollback ❯ (user prompts) + prior numbered Claude responses.
        return CLAUDE_WAITING_RE.test(text) ||
          lower.includes('allow execution') ||
          lower.includes('needs permission') ||
          lower.includes('yes, allow') ||
          lower.includes('do you want me to');

      default:
        return false;
    }
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
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd, aiLaunchCommand(tool)]);
    setLastTool(tool, cwd);
  }
}
