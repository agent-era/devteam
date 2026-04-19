import {commandExitCode, runCommandQuick, runCommandQuickAsync, runCommand, runInteractive, getCleanEnvironment} from '../shared/utils/commandExecutor.js';
import {SESSION_PREFIX} from '../constants.js';
import {logDebug} from '../shared/utils/logger.js';
import {Timer} from '../shared/utils/timing.js';
import {AIStatus, AITool} from '../models.js';
import {AIToolService} from './AIToolService.js';
import {HooksService} from './HooksService.js';

type SessionKind = 'agent' | 'execute' | 'shell';

type SessionDisplayMetadata = {
  project: string;
  worktree: string;
  sessionKind: SessionKind;
  aiTool?: AITool;
};

export class TmuxService {
  private aiToolService: AIToolService;
  private hooksService: HooksService;
  // Clean environment for tmux commands to avoid nvm conflicts
  private _tmuxEnv: NodeJS.ProcessEnv | null = null;
  private sessionNameRegex = /^[a-zA-Z0-9_-]+$/;

  constructor(aiToolService?: AIToolService, hooksService?: HooksService) {
    this.aiToolService = aiToolService || new AIToolService();
    this.hooksService = hooksService || new HooksService();
  }

  private get tmuxEnv(): NodeJS.ProcessEnv {
    if (!this._tmuxEnv) {
      this._tmuxEnv = getCleanEnvironment();
    }
    return this._tmuxEnv;
  }
  sessionName(project: string, feature: string): string {
    const name = `${SESSION_PREFIX}${project}-${feature}`;
    return this.sanitizeSessionName(name);
  }

  shellSessionName(project: string, feature: string): string {
    return `${this.sessionName(project, feature)}-shell`;
  }

  runSessionName(project: string, feature: string): string {
    return `${this.sessionName(project, feature)}-run`;
  }

  private sanitizeSessionName(name: string): string {
    // Strip disallowed characters and collapse repeats to maintain safety
    let n = String(name || '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
    if (!this.sessionNameRegex.test(n)) {
      // Fallback to a safe default if needed
      n = 'dev-safe';
    }
    return n;
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
    // Prefer hook-based status when fresh
    const hookStatus = this.hooksService.readStatus(session);
    if (hookStatus && !this.hooksService.isStale(hookStatus)) {
      const tool = hookStatus.tool as AITool;
      const status = hookStatus.status as AIStatus;
      return {tool, status};
    }

    // Fall back to tmux pane scraping
    const text = await this.capturePane(session);
    if (!text) return {tool: 'none', status: 'not_running'};

    // Detect which AI tool is running based on pane process
    const toolsMap = await this.aiToolService.detectAllSessionAITools();
    const aiTool = toolsMap.get(session) || 'none';
    if (aiTool === 'none') return {tool: 'none', status: 'not_running'};

    // Get status based on the detected tool's patterns
    const status = this.aiToolService.getStatusForTool(text, aiTool);
    return {tool: aiTool, status};
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

  /**
   * Configure a tmux session with mouse support and a clickable status bar
   * that exposes Detach and Kill actions.
   * Uses tmux status-format ranges (tmux 3.2+) and MouseDown1Status binding.
   */
  configureSessionUI(session: string, metadata?: SessionDisplayMetadata): void {
    try {
      const sessionMeta = metadata || this.inferSessionDisplayMetadata(session);
      this.storeSessionDisplayMetadata(session, sessionMeta);

      // Ensure mouse is enabled and status is visible
      this.setOption('mouse', 'on');
      this.setSessionOption(session, 'mouse', 'on');
      // Ensure status bar is visible
      this.setSessionOption(session, 'status', 'on');
      this.setSessionOption(session, 'status-position', 'bottom');
      this.setSessionOption(session, 'status-style', 'fg=colour255,bg=colour235');
      this.setSessionOption(session, 'status-interval', '5');
      this.setSessionOption(session, 'status-left-length', '120');
      this.setSessionOption(session, 'status-right-length', '120');
      runCommand([
        'tmux', 'set-option', '-t', session, 'status-format[0]',
        this.buildStatusFormat()
      ], { env: this.tmuxEnv });

      const bind = (key: string, args: string[]) => {
        try { runCommand(['tmux', 'unbind-key', '-n', key], { env: this.tmuxEnv }); } catch {}
        runCommand(['tmux', 'bind-key', '-n', key, ...args], { env: this.tmuxEnv });
      };

      // Bind both mouse down and mouse up on status regions for compatibility across tmux versions.
      for (const k of [
        'MouseDown1Status',
        'MouseDown1StatusLeft',
        'MouseDown1StatusRight',
        'MouseDown1StatusDefault',
        'MouseUp1Status',
        'MouseUp1StatusLeft',
        'MouseUp1StatusRight',
        'MouseUp1StatusDefault',
      ]) {
        bind(k, ['detach-client']);
      }
      // No debug messages bound
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to configure tmux session UI:', err);
    }
  }

  /**
   * Attach to a session with clickable status bar controls enabled.
   */
  attachSessionWithControls(sessionName: string, metadata?: SessionDisplayMetadata): void {
    this.configureSessionUI(sessionName, metadata);
    this.attachSessionInteractive(sessionName);
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
      if (this.aiToolService.isAIPaneCommand(command)) {
        return `${session}:${idx}`;
      }
    }
    
    // Fallback to first pane
    const firstIdx = lines[0]?.split(' ')[0] || '0.0';
    return `${session}:${firstIdx}`;
  }


  private shouldPreservSession(session: string, validWorktrees: string[]): boolean {
    const suffix = session.slice(SESSION_PREFIX.length);
    
    // Always preserve shell sessions
    if (suffix.endsWith('-shell')) return true;
    
    // Check if there's a matching worktree
    return validWorktrees.some((wt) => wt.includes(suffix));
  }

  private storeSessionDisplayMetadata(session: string, metadata: SessionDisplayMetadata): void {
    this.setSessionOption(session, '@devteam_project', metadata.project || 'unknown');
    this.setSessionOption(session, '@devteam_worktree', metadata.worktree || 'unknown');
    this.setSessionOption(session, '@devteam_session_chip', this.sessionChip(metadata.sessionKind, metadata.aiTool));
  }

  private inferSessionDisplayMetadata(session: string): SessionDisplayMetadata {
    let baseName = session.startsWith(SESSION_PREFIX) ? session.slice(SESSION_PREFIX.length) : session;
    let sessionKind: SessionKind = 'agent';

    if (baseName.endsWith('-shell')) {
      sessionKind = 'shell';
      baseName = baseName.slice(0, -'-shell'.length);
    } else if (baseName.endsWith('-run')) {
      sessionKind = 'execute';
      baseName = baseName.slice(0, -'-run'.length);
    }

    const [project = baseName || 'unknown', ...rest] = baseName.split('-');
    const worktree = rest.join('-') || project;
    return {project, worktree, sessionKind};
  }

  private sessionKindLabel(kind: SessionKind): string {
    if (kind === 'shell') return 'SHELL';
    if (kind === 'execute') return 'EXECUTE';
    return 'AGENT';
  }

  private sessionKindValue(kind: SessionKind, aiTool: AITool = 'none'): string {
    if (kind === 'shell' || kind === 'execute') return '';
    if (aiTool === 'claude') return 'claude';
    if (aiTool === 'codex') return 'codex';
    if (aiTool === 'gemini') return 'gemini';
    return '';
  }

  private sessionKindLabelBg(kind: SessionKind): string {
    return 'colour31';
  }

  private sessionKindValueBg(kind: SessionKind): string {
    return 'colour117';
  }

  private sessionChip(kind: SessionKind, aiTool: AITool = 'none'): string {
    const label = this.sessionKindLabel(kind);
    const value = this.sessionKindValue(kind, aiTool);
    const labelBg = this.sessionKindLabelBg(kind);
    const valueBg = this.sessionKindValueBg(kind);

    if (!value) {
      return `#[fg=colour231,bg=${labelBg},bold] ${label} `;
    }

    return `#[fg=colour231,bg=${labelBg},bold] ${label} #[fg=colour232,bg=${valueBg},bold] ${value} `;
  }

  private buildStatusFormat(): string {
    return (
      ' ' +
      '#[fg=colour255,bg=colour24,bold] #{@devteam_project} ' +
      '#[default]  ' +
      '#[fg=colour255,bg=colour95,bold] #{@devteam_worktree} ' +
      '#[default]  ' +
      '#{@devteam_session_chip}' +
      '#[default]' +
      '#[align=right]' +
      '#[fg=colour232,bg=colour117,bold] Click here to return (or Ctrl+b, then d) ' +
      '#[fg=colour231,bg=colour31,bold] DEVTEAM '
    );
  }
}
