import {commandExitCode, runCommandQuick, runCommandQuickAsync, runCommand, runInteractive} from '../utils.js';
import {SESSION_PREFIX, CLAUDE_PATTERNS, AI_TOOLS} from '../constants.js';
import {logDebug} from '../shared/utils/logger.js';
import {Timer} from '../shared/utils/timing.js';
import {AIStatus, AITool} from '../models.js';

// Backward compatibility
export type ClaudeStatus = AIStatus;

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
    const target = await this.findAIPaneTarget(session) || `${session}:0.0`;
    const output = await runCommandQuickAsync(['tmux', 'capture-pane', '-p', '-t', target, '-S', '-50']);
    
    return output || '';
  }

  async getAIStatus(session: string): Promise<{tool: AITool, status: AIStatus}> {
    const text = await this.capturePane(session);
    if (!text) return {tool: 'none', status: 'not_running'};
    
    // Detect which AI tool is running based on pane process
    const aiTool = await this.detectSessionAITool(session);
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
    return runCommandQuick(['tmux', 'kill-session', '-t', session]);
  }

  createSession(sessionName: string, cwd: string, autoExit: boolean = false): void {
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd]);
    if (autoExit) {
      this.setSessionOption(sessionName, 'remain-on-exit', 'off');
    }
  }

  createSessionWithCommand(sessionName: string, cwd: string, command: string, autoExit: boolean = true): void {
    const shell = process.env.SHELL || '/bin/bash';
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd, command || shell]);
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
      runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, text, 'C-m']);
    } else if (addNewline) {
      // Send text with newline character
      runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, text + '\n']);
    } else {
      // Send text as-is
      runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, text]);
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
        runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, 'Escape', 'Enter']);
      }
    });
    
    if (endWithExecute) {
      // Final execute command
      runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, 'C-m']);
    }
  }

  /**
   * Send special key combinations
   * @param session Session name
   * @param keys Key combination (e.g., 'Escape', 'Enter', 'C-m')
   */
  sendSpecialKeys(session: string, ...keys: string[]): void {
    runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, ...keys]);
  }

  attachSessionInteractive(sessionName: string): void {
    runInteractive('tmux', ['attach-session', '-t', sessionName]);
  }

  setOption(option: string, value: string): void {
    runCommand(['tmux', 'set-option', '-g', option, value]);
  }

  setSessionOption(session: string, option: string, value: string): void {
    runCommand(['tmux', 'set-option', '-t', session, option, value]);
  }

  async listPanes(session: string): Promise<string> {
    return await runCommandQuickAsync(['tmux', 'list-panes', '-t', `=${session}`, '-F', '#{window_index}.#{pane_index} #{pane_current_command}']) || '';
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

  private async detectSessionAITool(session: string): Promise<AITool> {
    const panes = await this.listPanes(session);
    if (!panes) return 'none';
    
    const lines = panes.split('\n').filter(Boolean);
    for (const line of lines) {
      const [, ...rest] = line.split(' ');
      const command = rest.join(' ').toLowerCase();
      
      // First try direct process name detection
      const tool = this.detectAITool(command);
      if (tool !== 'none' && tool !== 'codex') return tool;
      
      // For node processes, check pane content for codex-specific patterns
      if (command === 'node' || tool === 'codex') {
        const paneContent = await this.capturePane(session);
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
    
    let status: AIStatus = 'active';
    
    if (this.isWorking(text, patterns.working)) {
      status = 'working';
    } else if (this.isWaiting(text, patterns.waiting_numbered)) {
      status = 'waiting';
    } else if (this.isIdle(text, patterns.idle_prompt)) {
      status = 'idle';
    }
    
    return status;
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