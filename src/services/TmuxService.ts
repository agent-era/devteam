import {commandExitCode, runCommandQuick, runCommandQuickAsync, runCommand, runInteractive, getCleanEnvironment} from '../shared/utils/commandExecutor.js';
import {SESSION_PREFIX} from '../constants.js';
import {logDebug} from '../shared/utils/logger.js';
import {Timer} from '../shared/utils/timing.js';
import {AIStatus, AITool} from '../models.js';
import {AIToolService} from './AIToolService.js';


export class TmuxService {
  private aiToolService: AIToolService;
  // Clean environment for tmux commands to avoid nvm conflicts
  private _tmuxEnv: NodeJS.ProcessEnv | null = null;

  constructor(aiToolService?: AIToolService) {
    this.aiToolService = aiToolService || new AIToolService();
  }

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
  configureSessionUI(session: string): void {
    try {
      // Enable mouse and status bar for this session and make messages instant
      // Also ensure global mouse is on (safe and idempotent)
      this.setOption('mouse', 'on');
      this.setSessionOption(session, 'mouse', 'on');
      // Use a multi-line status so we have room for clickable controls
      this.setSessionOption(session, 'status', '3');
      this.setSessionOption(session, 'status-position', 'bottom');
      this.setSessionOption(session, 'status-interval', '1');
      this.setSessionOption(session, 'status-style', 'bg=black,fg=white');
      // Clear conflicting left/right for this session to ensure status-format renders alone
      this.setSessionOption(session, 'status-left', '');
      this.setSessionOption(session, 'status-right', '');

      // Clickable ranges on the status line. DETACH and KILL are user ranges.
      // Line 1: primary buttons + centered session name (static styles; no inline conditional styles to avoid rendering issues)
      const status0 = [
        '#[align=left]',
        '#[range=user|DETACH]#[fg=black,bg=yellow] [ Detach ] #[default]#[norange] ',
        '#[range=user|KILL]#[fg=white,bg=red] [ Kill ] #[default]#[norange]',
        ' #[align=centre]#[bold]#S#[nobold] ',
        ' #[align=right]#{?session_attached,attached,detached} '
      ].join('');
      // Set status-format globally to avoid per-session incompatibilities across tmux versions
      runCommand(['tmux', 'set-option', '-g', 'status-format[0]', status0], { env: this.tmuxEnv });

      // Line 2: keep simple; show session and time instead of complex window list to maximize compatibility
      const line1 = ' #[align=left]#{session_name} #[align=right]%Y-%m-%d %H:%M ';
      runCommand(['tmux', 'set-option', '-g', 'status-format[1]', line1], { env: this.tmuxEnv });

      // Line 3: hover status from last mouse event (stored in @devteam_hover) and hint
      const status2 = [
        '#[align=left]',
        '#{?#{==:#{@devteam_hover},DETACH},Hover: Detach — click to detach,',
        '#{?#{==:#{@devteam_hover},KILL},Hover: Kill — click to terminate session,}}',
        ' #[align=right] Ctrl+b then d to detach '
      ].join('');
      runCommand(['tmux', 'set-option', '-g', 'status-format[2]', status2], { env: this.tmuxEnv });

      // Global mouse binding that reacts to our status ranges only.
      // This is idempotent and generic; safe to set repeatedly.
      // On click in DETACH area -> detach this client; in KILL area -> confirm then kill session.
      runCommand(['tmux', 'unbind-key', '-n', 'MouseDown1Status'], { env: this.tmuxEnv });
      runCommand(['tmux', 'unbind-key', '-n', 'MouseUp1Status'], { env: this.tmuxEnv });
      // Update hover state on common mouse events on the status line
      const setHover = 'run-shell "tmux set -g @devteam_hover \"#{mouse_status_range}\""';
      for (const k of ['MouseDown1Status', 'MouseUp1Status', 'WheelUpStatus', 'WheelDownStatus', 'MouseDrag1Status', 'MouseDragEnd1Status']) {
        try {
          runCommand(['tmux', 'unbind-key', '-n', k], { env: this.tmuxEnv });
        } catch {}
        runCommand(['tmux', 'bind-key', '-n', k, setHover], { env: this.tmuxEnv });
      }
      // Click handler: record hover and perform action
      const handler = [
        'run-shell',
        '"',
        'R=\"#{mouse_status_range}\"; ',
        'tmux set -g @devteam_hover \"$R\"; ',
        'if [ \"$R\" = DETACH ]; then tmux detach-client; ',
        'elif [ \"$R\" = KILL ]; then tmux confirm-before -p \"Kill session #{session_name}?\" \"kill-session -t #{session_name}\"; ',
        'else tmux display-menu -T \"DevTeam\" -xM -yS ',
        '\"Detach\" d \"detach-client\" ',
        '"" \"Kill\" k \"confirm-before -p \"\"Kill session #{session_name}?\"\" \"\"kill-session -t #{session_name}\"\"\" ',
        '"" \"Cancel\" "" ""; fi',
        '"'
      ].join('');
      runCommand(['tmux', 'bind-key', '-n', 'MouseDown1Status', handler], { env: this.tmuxEnv });
      runCommand(['tmux', 'bind-key', '-n', 'MouseUp1Status', handler], { env: this.tmuxEnv });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to configure tmux session UI:', err);
    }
  }

  /**
   * Attach to a session with clickable status bar controls enabled.
   */
  attachSessionWithControls(sessionName: string): void {
    this.configureSessionUI(sessionName);
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
}
