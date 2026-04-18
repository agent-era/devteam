import {commandExitCode, runCommandQuick, runCommandQuickAsync, runCommand, runInteractive, getCleanEnvironment} from '../shared/utils/commandExecutor.js';
import {SESSION_PREFIX} from '../constants.js';
import {logDebug} from '../shared/utils/logger.js';
import {Timer} from '../shared/utils/timing.js';
import {AIStatus, AITool} from '../models.js';
import {AIToolService} from './AIToolService.js';
import {getProjectsDirectory} from '../config.js';

const NAV_PANE_TITLE = 'devteam-nav';
const MAIN_PANE_TITLE = 'devteam-main';
const NAV_PANE_HEIGHT = 8;

export class TmuxService {
  private aiToolService: AIToolService;
  // Clean environment for tmux commands to avoid nvm conflicts
  private _tmuxEnv: NodeJS.ProcessEnv | null = null;
  private sessionNameRegex = /^[a-zA-Z0-9_-]+$/;

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
    const name = `${SESSION_PREFIX}${project}-${feature}`;
    return this.sanitizeSessionName(name);
  }

  workspaceSessionName(sessionName: string): string {
    return this.sanitizeSessionName(`${SESSION_PREFIX}workspace-${this.getBaseSessionName(sessionName).slice(SESSION_PREFIX.length)}`);
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
    const target = this.getMainPaneTarget(session);
    
    if (executeCommand) {
      // Send as command and execute with Enter
      runCommand(['tmux', 'send-keys', '-t', target, text, 'C-m'], { env: this.tmuxEnv });
    } else if (addNewline) {
      // Send text with newline character
      runCommand(['tmux', 'send-keys', '-t', target, text + '\n'], { env: this.tmuxEnv });
    } else {
      // Send text as-is
      runCommand(['tmux', 'send-keys', '-t', target, text], { env: this.tmuxEnv });
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
    const target = this.getMainPaneTarget(session);
    
    lines.forEach((line) => {
      this.sendText(session, line);
      if (endWithAltEnter) {
        // Use Alt+Enter for multi-line input (like Claude input)
        runCommand(['tmux', 'send-keys', '-t', target, 'Escape', 'Enter'], { env: this.tmuxEnv });
      }
    });
    
    if (endWithExecute) {
      // Final execute command
      runCommand(['tmux', 'send-keys', '-t', target, 'C-m'], { env: this.tmuxEnv });
    }
  }

  /**
   * Send special key combinations
   * @param session Session name
   * @param keys Key combination (e.g., 'Escape', 'Enter', 'C-m')
   */
  sendSpecialKeys(session: string, ...keys: string[]): void {
    runCommand(['tmux', 'send-keys', '-t', this.getMainPaneTarget(session), ...keys], { env: this.tmuxEnv });
  }

  attachSessionInteractive(sessionName: string): void {
    runInteractive('tmux', ['attach-session', '-t', sessionName]);
  }

  switchClient(sessionName: string): void {
    runCommand(['tmux', 'switch-client', '-t', sessionName], { env: this.tmuxEnv });
  }

  selectMainPane(sessionName: string): void {
    runCommand(['tmux', 'select-pane', '-t', this.getMainPaneTarget(sessionName)], { env: this.tmuxEnv });
  }

  focusNavigatorPane(sessionName: string): void {
    const navPane = this.getSessionOptionValue(sessionName, '@devteam_nav_pane');
    if (navPane) runCommand(['tmux', 'select-pane', '-t', navPane], { env: this.tmuxEnv });
  }

  prepareSessionNavigator(sessionName: string): void {
    if (!this.hasSession(sessionName)) return;

    const panes = this.listPaneDetailsSync(sessionName);
    let navPane = panes.find((pane) => pane.title === NAV_PANE_TITLE);
    let mainPane = panes.find((pane) => pane.title === MAIN_PANE_TITLE) || panes.find((pane) => pane.title !== NAV_PANE_TITLE) || panes[0];
    if (!mainPane) return;

    runCommand(['tmux', 'select-pane', '-t', mainPane.id, '-T', MAIN_PANE_TITLE], { env: this.tmuxEnv });

    if (!navPane) {
      const cwd = runCommandQuick(['tmux', 'display-message', '-p', '-t', mainPane.id, '#{pane_current_path}'], undefined, this.tmuxEnv) || getProjectsDirectory();
      navPane = {
        id: runCommandQuick([
          'tmux',
          'split-window',
          '-bf',
          '-t',
          mainPane.id,
          '-l',
          String(NAV_PANE_HEIGHT),
          '-c',
          cwd,
          '-P',
          '-F',
          '#{pane_id}',
          this.getNavigatorCommand(sessionName),
        ], undefined, this.tmuxEnv),
        index: '0',
        title: NAV_PANE_TITLE,
        currentCommand: 'node',
      };
      if (navPane.id) {
        runCommand(['tmux', 'select-pane', '-t', navPane.id, '-T', NAV_PANE_TITLE], { env: this.tmuxEnv });
      }
    } else {
      runCommand(['tmux', 'respawn-pane', '-k', '-t', navPane.id, this.getNavigatorCommand(sessionName)], { env: this.tmuxEnv });
      runCommand(['tmux', 'select-pane', '-t', navPane.id, '-T', NAV_PANE_TITLE], { env: this.tmuxEnv });
    }

    if (navPane?.id) {
      runCommand(['tmux', 'resize-pane', '-t', navPane.id, '-y', String(NAV_PANE_HEIGHT)], { env: this.tmuxEnv });
      this.setSessionOption(sessionName, '@devteam_nav_pane', navPane.id);
    }
    if (mainPane.id) {
      this.setSessionOption(sessionName, '@devteam_main_pane', mainPane.id);
    }

    this.setSessionOption(sessionName, 'status', 'off');
    this.setSessionOption(sessionName, 'pane-border-status', 'off');
    this.setSessionOption(sessionName, 'mouse', 'on');
    this.selectMainPane(sessionName);
  }

  configureSessionUI(session: string): void {
    try {
      const sessions = this.listManagedSessionsSync();
      const families = this.buildSessionFamilies(sessions);
      const family = families.get(this.getBaseSessionName(session));

      this.bindMouseNavigation();
      this.setSessionOption(session, 'mouse', 'on');
      this.setSessionOption(session, 'status', 'on');
      this.setSessionOption(session, 'status-position', 'top');
      this.setSessionOption(session, 'status-style', 'fg=colour252,bg=colour235');
      this.setSessionOption(session, 'status-justify', 'left');
      this.setSessionOption(session, 'status-left-length', '0');
      this.setSessionOption(session, 'status-right-length', '0');
      this.setSessionOption(session, 'status', 'on');
      this.setSessionOption(session, 'status-left', '');
      this.setSessionOption(session, 'status-right', '');
      this.setSessionOption(session, 'status-interval', '5');
      this.setSessionOption(session, 'pane-border-status', 'bottom');
      this.setSessionOption(session, 'pane-border-style', 'fg=colour238');
      this.setSessionOption(session, 'pane-active-border-style', 'fg=colour39');

      if (!family) {
        runCommand([
          'tmux', 'set-option', '-t', session, 'status-format[0]',
          ' #[align=left] devteam #[align=right] Ctrl+b d to detach '
        ], { env: this.tmuxEnv });
        this.setSessionOption(session, 'pane-border-format', ' #[fg=colour245]agent shell run#[default] ');
        return;
      }

      this.setSessionOption(session, '@devteam_base_session', family.base);
      this.setSessionOption(session, '@devteam_agent_session', family.base);
      this.setSessionOption(session, '@devteam_shell_session', family.shell?.name || `${family.base}-shell`);
      this.setSessionOption(session, '@devteam_run_session', family.run?.name || `${family.base}-run`);
      this.setSessionOption(session, '@devteam_current_role', this.getSessionRole(session));
      this.setSessionOption(session, '@devteam_shell_available', family.shell ? '1' : '0');
      this.setSessionOption(session, '@devteam_run_available', family.run ? '1' : '0');

      runCommand([
        'tmux', 'set-option', '-t', session, 'status-format[0]',
        this.buildTopTabsFormat(session, families)
      ], { env: this.tmuxEnv });
      runCommand(['tmux', 'set-option', '-u', '-t', session, 'status-format[1]'], { env: this.tmuxEnv });
      this.setSessionOption(session, 'pane-border-format', this.buildBottomTabsFormat(session, family));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to configure tmux session UI:', err);
    }
  }

  /**
   * Attach to a session with clickable status bar controls enabled.
   */
  attachSessionWithControls(sessionName: string): void {
    this.prepareSessionNavigator(sessionName);
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
    if (!panes) return this.getMainPaneTarget(session);
    
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
    const firstIdx = lines[0]?.split(' ')[0];
    if (firstIdx) return `${session}:${firstIdx}`;
    return this.getMainPaneTarget(session);
  }


  private shouldPreservSession(session: string, validWorktrees: string[]): boolean {
    const suffix = session.slice(SESSION_PREFIX.length);
    
    // Always preserve shell sessions
    if (suffix.endsWith('-shell')) return true;
    
    // Check if there's a matching worktree
    return validWorktrees.some((wt) => wt.includes(suffix));
  }

  private bindMouseNavigation(): void {
    const unbind = (key: string) => {
      try { runCommand(['tmux', 'unbind-key', '-n', key], { env: this.tmuxEnv }); } catch {}
    };

    const bind = (key: string, args: string[]) => {
      unbind(key);
      runCommand(['tmux', 'bind-key', '-n', key, ...args], { env: this.tmuxEnv });
    };

    const statusBinding = [
      'run-shell',
      '-b',
      'range="#{mouse_status_range}"; ' +
        'role="#{@devteam_current_role}"; ' +
        'case "$range" in ' +
        'dt:switch:*) base="${range#dt:switch:}"; ' +
            'target="$base"; ' +
            'if [ "$role" = "shell" ] && tmux has-session -t "=${base}-shell" 2>/dev/null; then target="${base}-shell"; fi; ' +
            'if [ "$role" = "run" ] && tmux has-session -t "=${base}-run" 2>/dev/null; then target="${base}-run"; fi; ' +
            'tmux switch-client -t "$target" ;; ' +
        'esac'
    ];

    const borderBinding = [
      'run-shell',
      '-b',
      'word="$(printf %s "#{mouse_word}" | tr "[:upper:]" "[:lower:]")"; ' +
        'case "$word" in ' +
        'agent) target="#{@devteam_agent_session}" ;; ' +
        'shell) target="#{@devteam_shell_session}" ;; ' +
        'run) target="#{@devteam_run_session}" ;; ' +
        '*) exit 0 ;; ' +
        'esac; ' +
        'if tmux has-session -t "=$target" 2>/dev/null; then ' +
          'tmux switch-client -t "$target"; ' +
        'else ' +
          'tmux display-message "Open $word from devteam first"; ' +
        'fi'
    ];

    for (const key of [
      'MouseDown1Status',
      'MouseDown1StatusLeft',
      'MouseDown1StatusRight',
      'MouseDown1StatusDefault',
      'MouseUp1Status',
      'MouseUp1StatusLeft',
      'MouseUp1StatusRight',
      'MouseUp1StatusDefault',
    ]) {
      bind(key, statusBinding);
    }

    for (const key of ['MouseDown1Border', 'MouseUp1Border']) {
      bind(key, borderBinding);
    }
  }

  private listManagedSessionsSync(): TmuxManagedSession[] {
    const output = runCommandQuick([
      'tmux',
      'list-sessions',
      '-F',
      '#{session_id}\t#{session_name}\t#{session_last_attached}'
    ], undefined, this.tmuxEnv);

    if (!output) return [];

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id = '', name = '', lastAttached = '0'] = line.split('\t');
        return {
          id,
          name,
          lastAttached: Number(lastAttached) || 0,
          role: this.getSessionRole(name),
          base: this.getBaseSessionName(name),
        };
      })
      .filter((session) => session.name.startsWith(SESSION_PREFIX));
  }

  private buildSessionFamilies(sessions: TmuxManagedSession[]): Map<string, TmuxSessionFamily> {
    const families = new Map<string, TmuxSessionFamily>();

    for (const session of sessions) {
      const current = families.get(session.base) || {
        base: session.base,
        displayName: session.base.startsWith(SESSION_PREFIX) ? session.base.slice(SESSION_PREFIX.length) : session.base,
        lastAttached: 0,
      };

      current.lastAttached = Math.max(current.lastAttached, session.lastAttached);
      if (session.role === 'agent') current.agent = session;
      if (session.role === 'shell') current.shell = session;
      if (session.role === 'run') current.run = session;
      families.set(session.base, current);
    }

    return families;
  }

  private buildTopTabsFormat(currentSession: string, families: Map<string, TmuxSessionFamily>): string {
    const currentBase = this.getBaseSessionName(currentSession);
    const tabs = Array.from(families.values())
      .sort((a, b) => b.lastAttached - a.lastAttached || a.displayName.localeCompare(b.displayName))
      .map((family) => {
        const active = family.base === currentBase;
        const label = this.trimLabel(family.displayName, 28);
        const style = active
          ? '#[fg=colour235,bg=colour45,bold]'
          : '#[fg=colour252,bg=colour238]';
        const spacer = active ? '#[fg=colour45,bg=colour235]' : '#[fg=colour238,bg=colour235]';
        return `#[range=user|dt:switch:${family.base}]${style} ${label} ${spacer} `;
      })
      .join('');

    return `${tabs}#[default]#[align=right]#[fg=colour245,bg=colour235] click worktrees | Ctrl+b d detach `;
  }

  private buildBottomTabsFormat(currentSession: string, family: TmuxSessionFamily): string {
    const currentRole = this.getSessionRole(currentSession);
    const render = (label: 'agent' | 'shell' | 'run', available: boolean): string => {
      const active = currentRole === label;
      const style = active
        ? '#[fg=colour235,bg=colour148,bold]'
        : available
          ? '#[fg=colour252,bg=colour239]'
          : '#[fg=colour244,bg=colour237]';
      return `${style} ${label} #[default]`;
    };

    return [
      render('agent', true),
      render('shell', !!family.shell),
      render('run', !!family.run),
      '#[fg=colour244] click mode tabs #[default]'
    ].join('');
  }

  private getSessionRole(sessionName: string): TmuxSessionRole {
    if (sessionName.endsWith('-shell')) return 'shell';
    if (sessionName.endsWith('-run')) return 'run';
    return 'agent';
  }

  private getBaseSessionName(sessionName: string): string {
    if (sessionName.endsWith('-shell')) return sessionName.slice(0, -6);
    if (sessionName.endsWith('-run')) return sessionName.slice(0, -4);
    return sessionName;
  }

  private trimLabel(label: string, maxLength: number): string {
    if (label.length <= maxLength) return label;
    return `${label.slice(0, Math.max(0, maxLength - 3))}...`;
  }

  private getNavigatorCommand(sessionName: string): string {
    const cliEntry = process.argv[1] || 'devteam';
    return `${JSON.stringify(process.execPath)} ${JSON.stringify(cliEntry)} --dir ${JSON.stringify(getProjectsDirectory())} --tmux-nav --tmux-nav-session ${JSON.stringify(sessionName)}`;
  }

  private getMainPaneTarget(session: string): string {
    const stored = this.getSessionOptionValue(session, '@devteam_main_pane');
    if (stored) return stored;
    const panes = this.listPaneDetailsSync(session);
    const main = panes.find((pane) => pane.title === MAIN_PANE_TITLE) || panes.find((pane) => pane.title !== NAV_PANE_TITLE) || panes[0];
    return main?.id || `${session}:0.0`;
  }

  private getSessionOptionValue(session: string, option: string): string {
    return runCommandQuick(['tmux', 'show-options', '-v', '-t', session, option], undefined, this.tmuxEnv) || '';
  }

  private listPaneDetailsSync(session: string): TmuxPaneInfo[] {
    const output = runCommandQuick([
      'tmux',
      'list-panes',
      '-t',
      `=${session}:0`,
      '-F',
      '#{pane_id}\t#{pane_index}\t#{pane_title}\t#{pane_current_command}'
    ], undefined, this.tmuxEnv);
    if (!output) return [];
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id = '', index = '0', title = '', currentCommand = ''] = line.split('\t');
        return {id, index, title, currentCommand};
      });
  }
}

type TmuxSessionRole = 'agent' | 'shell' | 'run';

type TmuxManagedSession = {
  id: string;
  name: string;
  lastAttached: number;
  role: TmuxSessionRole;
  base: string;
};

type TmuxSessionFamily = {
  base: string;
  displayName: string;
  lastAttached: number;
  agent?: TmuxManagedSession;
  shell?: TmuxManagedSession;
  run?: TmuxManagedSession;
};

type TmuxPaneInfo = {
  id: string;
  index: string;
  title: string;
  currentCommand: string;
};
