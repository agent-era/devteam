import {commandExitCode, runCommandQuick, runCommandQuickAsync, runCommand, runInteractive, getCleanEnvironment} from '../utils.js';
import {SESSION_PREFIX, CLAUDE_PATTERNS, AI_TOOLS} from '../constants.js';
import {logDebug} from '../shared/utils/logger.js';
import {Timer} from '../shared/utils/timing.js';
import {AIStatus, AITool} from '../models.js';

// Backward compatibility
export type ClaudeStatus = AIStatus;

export class TmuxService {
  // Clean environment for tmux commands to avoid nvm conflicts
  private _tmuxEnv: NodeJS.ProcessEnv | null = null;
  
  private get tmuxEnv(): NodeJS.ProcessEnv {
    if (!this._tmuxEnv) {
      this._tmuxEnv = getCleanEnvironment();
    }
    return this._tmuxEnv;
  }
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
    const code = commandExitCode(['tmux', 'has-session', '-t', `=${session}`], undefined, this.tmuxEnv);
    return code === 0;
  }

  async listSessions(): Promise<string[]> {
    const output = await runCommandQuickAsync(['tmux', 'list-sessions', '-F', '#S'], undefined, this.tmuxEnv);
    if (!output) return [];
    
    const sessions = output.split('\n').filter(Boolean);
    return sessions;
  }

  async capturePane(session: string): Promise<string> {
    const target = await this.findAIPaneTarget(session) || `${session}:0.0`;
    const output = await runCommandQuickAsync(['tmux', 'capture-pane', '-p', '-t', target, '-S', '-50'], undefined, this.tmuxEnv);
    
    return output || '';
  }

  async getAIStatus(session: string): Promise<{tool: AITool, status: AIStatus}> {
    const text = await this.capturePane(session);
    if (!text) return {tool: 'none', status: 'not_running'};
    
    // Detect which AI tool is running based on pane process
    const toolsMap = await this.detectAllSessionAITools();
    const aiTool = toolsMap.get(session) || 'none';
    if (aiTool === 'none') return {tool: 'none', status: 'not_running'};
    
    // Get status based on the detected tool's patterns
    const status = this.getStatusForTool(text, aiTool);
    return {tool: aiTool, status};
  }

  // Backward compatibility
  async getClaudeStatus(session: string): Promise<ClaudeStatus> {
    const result = await this.getAIStatus(session);
    return result.status;
  }

  killSession(session: string): string {
    return runCommandQuick(['tmux', 'kill-session', '-t', session], undefined, this.tmuxEnv);
  }

  createSession(sessionName: string, cwd: string, autoExit: boolean = false): void {
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd], { env: this.tmuxEnv });
    if (autoExit) {
      this.setSessionOption(sessionName, 'remain-on-exit', 'off');
    }
  }

  createSessionWithCommand(sessionName: string, cwd: string, command: string, autoExit: boolean = true): void {
    const shell = process.env.SHELL || '/bin/bash';
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd, command || shell], { env: this.tmuxEnv });
    if (autoExit) {
      this.setSessionOption(sessionName, 'remain-on-exit', 'off');
    }
  }

  /**
   * Send text input to a tmux session
   * @param session Session name
   * @param text Text to send
   * @param options Options for handling newlines and completion
   */
  sendText(session: string, text: string, options: {
    addNewline?: boolean;
    executeCommand?: boolean;
  } = {}): void {
    const { addNewline = false, executeCommand = false } = options;
    
    if (executeCommand) {
      // Send as command and execute with Enter
      runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, text, 'C-m'], { env: this.tmuxEnv });
    } else if (addNewline) {
      // Send text with newline character
      runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, text + '\n'], { env: this.tmuxEnv });
    } else {
      // Send text as-is
      runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, text], { env: this.tmuxEnv });
    }
  }

  /**
   * Send multiple lines of text, useful for multi-line input
   * @param session Session name
   * @param lines Array of text lines
   * @param options Options for handling each line
   */
  sendMultilineText(session: string, lines: string[], options: {
    endWithAltEnter?: boolean;
    endWithExecute?: boolean;
  } = {}): void {
    const { endWithAltEnter = false, endWithExecute = false } = options;
    
    lines.forEach((line) => {
      this.sendText(session, line);
      if (endWithAltEnter) {
        // Use Alt+Enter for multi-line input (like Claude input)
        runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, 'Escape', 'Enter'], { env: this.tmuxEnv });
      }
    });
    
    if (endWithExecute) {
      // Final execute command
      runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, 'C-m'], { env: this.tmuxEnv });
    }
  }

  /**
   * Send special key combinations
   * @param session Session name
   * @param keys Key combination (e.g., 'Escape', 'Enter', 'C-m')
   */
  sendSpecialKeys(session: string, ...keys: string[]): void {
    runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, ...keys], { env: this.tmuxEnv });
  }

  attachSessionInteractive(sessionName: string): void {
    runInteractive('tmux', ['attach-session', '-t', sessionName]);
  }

  setOption(option: string, value: string): void {
    runCommand(['tmux', 'set-option', '-g', option, value], { env: this.tmuxEnv });
  }

  setSessionOption(session: string, option: string, value: string): void {
    runCommand(['tmux', 'set-option', '-t', session, option, value], { env: this.tmuxEnv });
  }

  async listPanes(session: string): Promise<string> {
    return await runCommandQuickAsync(['tmux', 'list-panes', '-t', `=${session}`, '-F', '#{window_index}.#{pane_index} #{pane_current_command}'], undefined, this.tmuxEnv) || '';
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
  private async findAIPaneTarget(session: string): Promise<string | null> {
    const panes = await this.listPanes(session);
    if (!panes) return `${session}:0.0`;
    
    const lines = panes.split('\n').filter(Boolean);
    
    // Look for AI tool processes
    for (const line of lines) {
      const [idx, ...rest] = line.split(' ');
      const command = rest.join(' ').toLowerCase();
      if (this.detectAITool(command) !== 'none') {
        return `${session}:${idx}`;
      }
    }
    
    // Fallback to first pane
    const firstIdx = lines[0]?.split(' ')[0] || '0.0';
    return `${session}:${firstIdx}`;
  }

  private detectAITool(command: string): AITool {
    for (const [tool, config] of Object.entries(AI_TOOLS)) {
      if (config.processPatterns.some(pattern => command.includes(pattern))) {
        return tool as AITool;
      }
    }
    return 'none';
  }

  // Cache for batch detection results
  private aiToolsCache: Map<string, AITool> | null = null;
  private aiToolsCacheTime: number = 0;
  private readonly CACHE_DURATION = 2000; // 2 seconds cache

  private async detectAllSessionAITools(): Promise<Map<string, AITool>> {
    // Return cached results if fresh
    if (this.aiToolsCache && Date.now() - this.aiToolsCacheTime < this.CACHE_DURATION) {
      return this.aiToolsCache;
    }

    const toolsMap = new Map<string, AITool>();
    
    // Get all sessions with their PIDs in one command
    const output = await runCommandQuickAsync(['tmux', 'list-panes', '-a', '-F', '#{session_name}:#{pane_pid}'], undefined, this.tmuxEnv);
    if (!output) {
      this.aiToolsCache = toolsMap;
      this.aiToolsCacheTime = Date.now();
      return toolsMap;
    }
    
    // Parse session:pid pairs
    const sessionPids: Array<{session: string, pid: string}> = [];
    const lines = output.split('\n').filter(Boolean);
    for (const line of lines) {
      const [session, pid] = line.split(':');
      if (session && pid) {
        // Only process our dev- sessions
        if (session.startsWith(SESSION_PREFIX)) {
          sessionPids.push({session, pid});
        }
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
            const argsLower = args.toLowerCase();
            
            // Find which session this PID belongs to
            const sessionInfo = sessionPids.find(sp => sp.pid === pid);
            if (sessionInfo) {
              // Detect tool from args
              let tool: AITool = 'none';
              if (argsLower.includes('/claude') || argsLower.includes('claude')) {
                tool = 'claude';
              } else if (argsLower.includes('/codex') || argsLower.includes('codex')) {
                tool = 'codex';
              } else if (argsLower.includes('/gemini') || argsLower.includes('gemini')) {
                tool = 'gemini';
              }
              
              toolsMap.set(sessionInfo.session, tool);
            }
          }
        }
      }
    }
    
    // Cache the results
    this.aiToolsCache = toolsMap;
    this.aiToolsCacheTime = Date.now();
    
    return toolsMap;
  }

  private async detectSessionAITool(session: string): Promise<AITool> {
    // Get the PID of the first pane to check full process command
    const pidOutput = await runCommandQuickAsync(['tmux', 'list-panes', '-F', '#{pane_pid}', '-t', `${session}:0`], undefined, this.tmuxEnv);
    const pid = pidOutput?.trim();
    
    if (pid) {
      // Get full command line arguments
      const processArgs = await runCommandQuickAsync(['ps', '-p', pid, '-o', 'args=']);
      if (processArgs) {
        const argsLower = processArgs.toLowerCase();
        
        // Check for tool names in the full command path/args
        if (argsLower.includes('/claude') || argsLower.includes('claude')) {
          return 'claude';
        }
        if (argsLower.includes('/codex') || argsLower.includes('codex')) {
          return 'codex';
        }
        if (argsLower.includes('/gemini') || argsLower.includes('gemini')) {
          return 'gemini';
        }
      }
    }
    
    // Fallback to original detection method if ps command fails
    const panes = await this.listPanes(session);
    if (!panes) return 'none';
    
    const lines = panes.split('\n').filter(Boolean);
    for (const line of lines) {
      const [, ...rest] = line.split(' ');
      const command = rest.join(' ').toLowerCase();
      
      // First try direct process name detection for non-node processes
      const tool = this.detectAITool(command);
      if (tool !== 'none' && command !== 'node') return tool;
      
      // For node processes, check pane content for tool-specific patterns as last resort
      if (command === 'node') {
        const paneContent = await this.capturePane(session);
        
        // Check for Gemini patterns first (more specific)
        if (paneContent.includes('gemini-2.5-pro') || paneContent.includes('│ >')) {
          return 'gemini';
        }
        
        // Then check for Codex patterns
        if (paneContent.includes('▌') || paneContent.includes('⏎ send')) {
          return 'codex';
        }
      }
    }
    
    return 'none';
  }

  private getStatusForTool(text: string, tool: AITool): AIStatus {
    if (tool === 'none') return 'not_running';
    
    const toolConfig = AI_TOOLS[tool];
    const patterns = toolConfig.statusPatterns;
    
    // Check in priority order: working → waiting → idle (default)
    // We check working first because it's more specific (contains "esc to interrupt/cancel")
    
    // 1. Check for working state first (most specific)
    if (this.isWorking(text, patterns.working)) {
      return 'working';
    }
    
    // 2. Check for waiting states
    if (tool === 'gemini' && text.toLowerCase().includes('waiting for user')) {
      return 'waiting';
    }
    if (tool === 'codex') {
      // Codex is waiting if it does NOT have "⏎ send" (when not working)
      // This means it's waiting for user response to a question
      if (!text.includes('⏎ send')) {
        return 'waiting';
      }
    }
    if (tool === 'claude' && this.isWaiting(text, patterns.waiting_numbered)) {
      return 'waiting';
    }
    
    // 3. Default to idle (don't check patterns, just assume idle if not waiting/working)
    return 'idle';
  }

  // Generic status detection methods
  private isWorking(text: string, pattern: string): boolean {
    const lowerText = text.toLowerCase();
    return lowerText.includes(pattern.toLowerCase());
  }

  private isWaiting(text: string, patterns: readonly [string, string]): boolean {
    const [promptSymbol, pattern] = patterns;
    return text.includes(promptSymbol) && new RegExp(pattern, 'm').test(text);
  }

  private isIdle(text: string, patterns: readonly [string, string]): boolean {
    const [promptStart, promptEnd] = patterns;
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

  // Backward compatibility - keep old methods but use new logic
  private isClaudeProcess(command: string): boolean {
    return this.detectAITool(command) === 'claude';
  }

  private isClaudeWorking(text: string): boolean {
    return this.isWorking(text, CLAUDE_PATTERNS.working);
  }

  private isClaudeWaiting(text: string): boolean {
    return this.isWaiting(text, CLAUDE_PATTERNS.waiting_numbered);
  }

  private isClaudeIdle(text: string): boolean {
    return this.isIdle(text, CLAUDE_PATTERNS.idle_prompt);
  }

  private shouldPreservSession(session: string, validWorktrees: string[]): boolean {
    const suffix = session.slice(SESSION_PREFIX.length);
    
    // Always preserve shell sessions
    if (suffix.endsWith('-shell')) return true;
    
    // Check if there's a matching worktree
    return validWorktrees.some((wt) => wt.includes(suffix));
  }
}