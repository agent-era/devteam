import {CoreBase} from '../engine/core-types.js';
import {WorktreeInfo, SessionInfo, GitStatus, AITool} from '../models.js';
import {GitService} from '../services/GitService.js';
import {getProjectsDirectory} from '../config.js';
import {TmuxService} from '../services/TmuxService.js';
import {WorkspaceService} from '../services/WorkspaceService.js';
import {MemoryMonitorService, MemoryStatus} from '../services/MemoryMonitorService.js';
import {RUN_CONFIG_FILE, DIR_BRANCHES_SUFFIX, TMUX_DISPLAY_TIME, RUN_CONFIG_CLAUDE_PROMPT, SETTINGS_EDIT_CLAUDE_PROMPT, AI_TOOLS, type ProjectConfig} from '../constants.js';
import {detectAvailableAITools, runCommandQuick, runClaudeAsync} from '../shared/utils/commandExecutor.js';
import path from 'node:path';
import fs from 'node:fs';
import {startIntervalIfEnabled} from '../shared/utils/intervals.js';
import {readFileOrNull, extractJsonObject, shellQuote} from '../shared/utils/fileSystem.js';
import {logDebug, logError} from '../shared/utils/logger.js';
import {aiLaunchCommand} from '../constants.js';
import {getLastTool, setLastTool} from '../shared/utils/aiSessionMemory.js';

type State = {
  worktrees: WorktreeInfo[];
  loading: boolean;
  lastRefreshed: number;
  selectedIndex: number;
  memoryStatus: MemoryStatus | null;
  versionInfo: any | null;
};

export class WorktreeCore implements CoreBase<State> {
  private state: State = {worktrees: [], loading: false, lastRefreshed: 0, selectedIndex: 0, memoryStatus: null, versionInfo: null};
  private listeners = new Set<(s: Readonly<State>) => void>();
  private git: GitService;
  private tmux: TmuxService;
  private workspace: WorkspaceService;
  private memory: MemoryMonitorService;
  private versionService: any | null = null;
  private timers: Array<() => void> = [];
  private isRefreshingVisible = false;
  private availableAITools: (keyof typeof import('../constants.js').AI_TOOLS)[];

  constructor(opts?: {git?: GitService; tmux?: TmuxService; workspace?: WorkspaceService; memory?: MemoryMonitorService; versionService?: any}) {
    this.git = opts?.git || new GitService(getProjectsDirectory());
    this.tmux = opts?.tmux || new TmuxService();
    this.workspace = opts?.workspace || new WorkspaceService();
    this.memory = opts?.memory || new MemoryMonitorService();
    this.versionService = opts?.versionService || null;
    this.availableAITools = detectAvailableAITools();
  }

  // CoreBase
  get(): Readonly<State> { return this.state; }
  subscribe(fn: (s: Readonly<State>) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  start(): void {
    const refreshClear = startIntervalIfEnabled(() => { this.refresh().catch(() => {}); }, 60_000);
    const memClear = startIntervalIfEnabled(() => { this.refreshMemoryStatus().catch(() => {}); }, 60_000);
    this.timers.push(refreshClear, memClear);
    void this.refresh();
    void this.refreshMemoryStatus();
    void this.refreshVersionInfo();
  }
  stop(): void {
    for (const t of this.timers) t?.();
    this.timers = [];
  }

  // Public API (aligns with current context)
  selectWorktree(index: number): void { this.setState({selectedIndex: Math.max(0, Math.min(index, this.state.worktrees.length - 1))}); }
  getSelectedWorktree(): WorktreeInfo | null { return this.state.worktrees[this.state.selectedIndex] || null; }

  async refresh(): Promise<void> {
    if (this.state.loading) return;
    this.setState({loading: true});
    try {
      const projects = this.git.discoverProjects();
      const collected: WorktreeInfo[] = [];
      const sessions = await this.tmux.listSessions();
      for (const project of projects) {
        const worktrees = await this.git.getWorktreesForProject(project);
        for (const w of worktrees) {
          const sessionName = this.tmux.sessionName(w.project, w.feature);
          const attached = sessions.includes(sessionName);
          const shell_attached = sessions.includes(this.tmux.shellSessionName(w.project, w.feature));
          const run_attached = sessions.includes(this.tmux.runSessionName(w.project, w.feature));
          const [gitStatus, aiResult] = await Promise.all([
            this.git.getGitStatus(w.path),
            attached ? this.tmux.getAIStatus(sessionName) : Promise.resolve({tool: 'none' as const, status: 'not_running' as const})
          ]);
          collected.push(new WorktreeInfo({
            project: w.project,
            feature: w.feature,
            path: w.path,
            branch: w.branch,
            git: gitStatus,
            session: new SessionInfo({session_name: sessionName, attached, ai_status: aiResult.status, ai_tool: aiResult.tool, shell_attached, run_attached}),
            last_commit_ts: w.last_commit_ts || 0,
          }));
        }
      }

      // Group by feature to optionally inject workspace headers and mark children
      const byFeature = new Map<string, WorktreeInfo[]>();
      for (const wt of collected) {
        const arr = byFeature.get(wt.feature) || [];
        arr.push(wt);
        byFeature.set(wt.feature, arr);
      }

      // Build groups per feature so workspace header + children remain contiguous
      type Group = { feature: string; header: WorktreeInfo | null; items: WorktreeInfo[]; ts: number };
      const base = this.git.basePath;
      const groups: Group[] = [];
      for (const [feature, items] of byFeature.entries()) {
        const hasWS = this.workspace.hasWorkspaceForFeature(base, feature);
        let header: WorktreeInfo | null = null;
        if (hasWS) {
          const wsPath = path.join(base, 'workspaces', feature);
          const wsSession = this.tmux.sessionName('workspace', feature);
          const wsAttached = sessions.includes(wsSession);
          const aiResult = wsAttached ? await this.tmux.getAIStatus(wsSession) : {tool: 'none' as const, status: 'not_running' as const};
          header = new WorktreeInfo({
            project: 'workspace',
            feature,
            path: wsPath,
            branch: feature,
            session: new SessionInfo({
            session_name: wsSession,
            attached: wsAttached,
            ai_status: aiResult.status,
            ai_tool: aiResult.tool,
            shell_attached: sessions.includes(this.tmux.shellSessionName('workspace', feature)),
            run_attached: sessions.includes(this.tmux.runSessionName('workspace', feature)),
          }),
          });
          (header as any).is_workspace = true;
          (header as any).is_workspace_header = true;
          // Mark children metadata
          for (let i = 0; i < items.length; i++) {
            const c = items[i];
            (c as any).is_workspace_child = true;
            (c as any).parent_feature = feature;
            (c as any).is_last_workspace_child = i === items.length - 1;
          }
        }
        const ts = items.reduce((m, it) => Math.max(m, it.last_commit_ts || 0), 0);
        groups.push({ feature, header, items: [...items], ts });
      }

      // Sort groups by recency (max child ts), then feature name
      groups.sort((a, b) => {
        const d = (b.ts || 0) - (a.ts || 0);
        if (d !== 0) return d;
        return a.feature.localeCompare(b.feature);
      });

      // Within each group, sort children alphabetically for stability
      const result: WorktreeInfo[] = [];
      for (const g of groups) {
        if (g.header) result.push(g.header);
        g.items.sort((a, b) => {
          if (a.project !== b.project) return a.project.localeCompare(b.project);
          return a.feature.localeCompare(b.feature);
        });
        result.push(...g.items);
      }

      this.setState({worktrees: result, lastRefreshed: Date.now()});
    } catch (e) {
      logError('WorktreeCore.refresh failed', {error: e instanceof Error ? e.message : String(e)});
    } finally {
      this.setState({loading: false});
    }
  }

  async refreshVisibleStatus(currentPage: number, pageSize: number): Promise<void> {
    if (this.isRefreshingVisible) return;
    this.isRefreshingVisible = true;
    try {
      // Compute slice and refresh git/tmux status for visible rows
      const start = currentPage * pageSize;
      const end = Math.min(start + pageSize, this.state.worktrees.length);
      const slice = this.state.worktrees.slice(start, end);
      const sessions = await this.tmux.listSessions();
      const updated: WorktreeInfo[] = [];
      for (const wt of slice) {
        const sessionName = this.tmux.sessionName(wt.project, wt.feature);
        const attached = sessions.includes(sessionName);
        const shell_attached = sessions.includes(this.tmux.shellSessionName(wt.project, wt.feature));
        const run_attached = sessions.includes(this.tmux.runSessionName(wt.project, wt.feature));
        // Fetch AI status first: if agent just finished working, invalidate the git slow-metrics
        // cache before fetching git status so this tick shows fresh committed stats.
        const aiResult = attached
          ? await this.tmux.getAIStatus(sessionName)
          : {tool: 'none' as const, status: 'not_running' as const};
        if (wt.session?.ai_status === 'working' && aiResult.status !== 'working') {
          this.git.invalidateGitSlowCache(wt.path);
        }
        const gitStatus = await this.git.getGitStatus(wt.path);
        updated.push(new WorktreeInfo({...wt, git: gitStatus, session: new SessionInfo({session_name: sessionName, attached, ai_status: aiResult.status, ai_tool: aiResult.tool, shell_attached, run_attached})}));
      }
      const arr = [...this.state.worktrees];
      for (let i = 0; i < updated.length; i++) arr[start + i] = updated[i];
      this.setState({worktrees: arr, lastRefreshed: Date.now()});
    } finally {
      this.isRefreshingVisible = false;
    }
  }

  async forceRefreshVisible(currentPage: number, pageSize: number): Promise<void> {
    this.isRefreshingVisible = false; // preempt any in-flight poll
    await this.refreshVisibleStatus(currentPage, pageSize);
  }

  private async refreshSingleWorktree(worktree: WorktreeInfo, invalidateGitCache = false): Promise<void> {
    try {
      if (invalidateGitCache) this.git.invalidateGitSlowCache(worktree.path);
      const sessions = await this.tmux.listSessions();
      const sessionName = this.tmux.sessionName(worktree.project, worktree.feature);
      const attached = sessions.includes(sessionName);
      const [gitStatus, aiResult] = await Promise.all([
        this.git.getGitStatus(worktree.path),
        attached
          ? this.tmux.getAIStatus(sessionName)
          : Promise.resolve({tool: 'none' as const, status: 'not_running' as const}),
      ]);
      const shell_attached = sessions.includes(this.tmux.shellSessionName(worktree.project, worktree.feature));
      const run_attached = sessions.includes(this.tmux.runSessionName(worktree.project, worktree.feature));
      const updated = new WorktreeInfo({
        ...worktree,
        git: gitStatus,
        session: new SessionInfo({session_name: sessionName, attached, ai_status: aiResult.status, ai_tool: aiResult.tool, shell_attached, run_attached}),
      });
      const arr = [...this.state.worktrees];
      const idx = arr.findIndex(w => w.path === worktree.path);
      if (idx >= 0) arr[idx] = updated;
      this.setState({worktrees: arr, lastRefreshed: Date.now()});
    } catch {}
  }

  // Worktree operations
  async createFeature(projectName: string, featureName: string): Promise<WorktreeInfo | null> {
    const created = this.git.createWorktree(projectName, featureName);
    if (!created) return null;
    const worktreePath = path.join(this.git.basePath, `${projectName}${DIR_BRANCHES_SUFFIX}`, featureName);
    this.setupWorktreeEnvironment(projectName, worktreePath);
    await this.refresh();
    return new WorktreeInfo({project: projectName, feature: featureName, path: worktreePath, branch: featureName});
  }

  async createFromBranch(project: string, remoteBranch: string, localName: string): Promise<boolean> {
    const created = this.git.createWorktreeFromRemote(project, remoteBranch, localName);
    if (!created) return false;
    const worktreePath = path.join(this.git.basePath, `${project}${DIR_BRANCHES_SUFFIX}`, localName);
    this.setupWorktreeEnvironment(project, worktreePath);
    await this.refresh();
    return true;
  }

  getUntrackedNonIgnoredFiles(worktreePath: string): string[] {
    return this.git.getUntrackedNonIgnoredFiles(worktreePath);
  }

  async archiveFeature(worktreeOrProject: WorktreeInfo | string, worktreePath?: string, feature?: string): Promise<{archivedPath: string}> {
    let project: string, workPath: string, featureName: string;
    if (typeof worktreeOrProject === 'string') { project = worktreeOrProject; workPath = worktreePath!; featureName = feature!; }
    else { project = worktreeOrProject.project; workPath = worktreeOrProject.path; featureName = worktreeOrProject.feature; }
    await this.terminateFeatureSessions(project, featureName);
    const archivedRoot = path.join(this.git.basePath, `${project}-archived`);
    try { fs.mkdirSync(archivedRoot, {recursive: true}); } catch {}
    const ts = Date.now();
    const archivedDest = path.join(archivedRoot, `archived-${ts}_${featureName}`);
    this.git.archiveWorktree(project, workPath, archivedDest);
    this.git.pruneWorktreeReferences(project);
    await this.refresh();
    return {archivedPath: archivedDest};
  }

  async archiveWorkspace(featureName: string): Promise<void> {
    // No-op placeholder (workspaces cleanup handled when last child archived in UI flow)
    await this.refresh();
  }

  // Workspace operations
  async createWorkspace(featureName: string, projects: string[]): Promise<string | null> {
    try {
      const base = this.git.basePath;
      const entries = projects.map((p) => ({project: p, worktreePath: path.join(base, `${p}${DIR_BRANCHES_SUFFIX}`, featureName)}));
      const workspacePath = this.workspace.createWorkspace(base, featureName, entries);
      await this.refresh();
      return workspacePath;
    } catch (err) {
      logError('createWorkspace failed', {error: err instanceof Error ? err.message : String(err)});
      return null;
    }
  }
  workspaceExists(featureName: string): boolean { try { return this.workspace.hasWorkspaceForFeature(this.git.basePath, featureName); } catch { return false; } }

  // Sessions
  async attachSession(worktree: WorktreeInfo, aiTool?: AITool): Promise<void> {
    const sessionName = this.tmux.sessionName(worktree.project, worktree.feature);
    const sessions = await this.tmux.listSessions();
    const sessionTool = worktree.session?.ai_tool as AITool | undefined;
    let selectedTool: AITool = sessionTool && sessionTool !== 'none' ? sessionTool : 'none';
    if (!sessions.includes(sessionName)) {
      // Preference order for which tool to launch:
      //   1. Explicit argument (e.g. from the tool-picker dialog)
      //   2. Tool currently running in the session (won't apply when there's no session)
      //   3. Last tool devteam launched here, remembered across restarts
      //   4. First available installed tool
      const remembered = getLastTool(worktree.path);
      selectedTool = 'none';
      if (aiTool && aiTool !== 'none') selectedTool = aiTool;
      else if (sessionTool && sessionTool !== 'none') selectedTool = sessionTool;
      else if (remembered) selectedTool = remembered;
      if (selectedTool !== 'none') {
        const flags = this.getAIToolFlags(worktree.project, selectedTool);
        const flagStr = flags.length > 0 ? ' ' + flags.map(shellQuote).join(' ') : '';
        if (selectedTool === 'claude') this.launchClaudeSessionWithFallback(sessionName, worktree.path, flagStr);
        else this.tmux.createSessionWithCommand(sessionName, worktree.path, aiLaunchCommand(selectedTool) + flagStr, true);
        setLastTool(selectedTool, worktree.path);
      } else {
        this.tmux.createSession(sessionName, worktree.path, true);
      }
    }
    this.tmux.attachSessionWithControls(sessionName, {
      project: worktree.project,
      worktree: worktree.feature,
      sessionKind: 'agent',
      aiTool: selectedTool,
    });
    await this.refreshSingleWorktree(worktree); // working→idle transition handles cache invalidation
  }
  async attachShellSession(worktree: WorktreeInfo): Promise<void> {
    const name = this.tmux.shellSessionName(worktree.project, worktree.feature);
    const sessions = await this.tmux.listSessions();
    if (!sessions.includes(name)) this.tmux.createSession(name, worktree.path, false);
    this.tmux.attachSessionWithControls(name, {
      project: worktree.project,
      worktree: worktree.feature,
      sessionKind: 'shell',
    });
    await this.refreshSingleWorktree(worktree, true); // user may have committed
  }
  async attachRunSession(worktree: WorktreeInfo): Promise<'success' | 'no_config'> {
    const name = this.tmux.runSessionName(worktree.project, worktree.feature);
    const sessions = await this.tmux.listSessions();
    if (!sessions.includes(name)) this.tmux.createSession(name, worktree.path, false);
    const cfg = this.readProjectConfig(worktree.project);
    if (!cfg) return 'no_config';
    const exec = cfg.executionInstructions ?? {};
    const mainCmd = exec.mainCommand;
    const pre = Array.isArray(exec.preRunCommands) ? exec.preRunCommands.filter(Boolean) : [];
    const env = exec.environmentVariables && typeof exec.environmentVariables === 'object' ? exec.environmentVariables : {};
    // detachOnExit=true means the pane detaches (closes) when the command exits.
    // detachOnExit=false keeps the pane open so the user can read the output.
    try { this.tmux.setSessionOption(name, 'remain-on-exit', exec.detachOnExit ? 'off' : 'on'); } catch {}
    if (!mainCmd || typeof mainCmd !== 'string' || mainCmd.trim().length === 0) {
      this.tmux.attachSessionWithControls(name, {
        project: worktree.project,
        worktree: worktree.feature,
        sessionKind: 'execute',
      });
      await this.refreshSingleWorktree(worktree);
      return 'no_config';
    }
    for (const [k, v] of Object.entries(env)) {
      this.tmux.sendText(name, `export ${k}=${JSON.stringify(String(v))}`, { executeCommand: true });
    }
    for (const cmd of pre) this.tmux.sendText(name, cmd, { executeCommand: true });
    this.tmux.sendText(name, mainCmd, { executeCommand: true });
    this.tmux.attachSessionWithControls(name, {
      project: worktree.project,
      worktree: worktree.feature,
      sessionKind: 'execute',
    });
    await this.refreshSingleWorktree(worktree);
    return 'success';
  }

  // AI tool utilities
  getAvailableAITools(): (keyof typeof import('../constants.js').AI_TOOLS)[] { return this.availableAITools; }
  async needsToolSelection(worktree: WorktreeInfo): Promise<boolean> {
    const current = (worktree.session?.ai_tool as AITool) || 'none';
    if (current !== 'none') return false;
    // Skip the picker when we remember which tool this worktree used.
    if (getLastTool(worktree.path)) return false;
    return this.availableAITools.length > 1;
  }

  // Projects
  discoverProjects(): Array<{name: string; path: string}> { return this.git.discoverProjects(); }
  async getRemoteBranches(project: string): Promise<Array<Record<string, any>>> { return this.git.getRemoteBranches(project); }

  // Run config
  getRunConfigPath(project: string): string { return path.join(this.git.basePath, project, RUN_CONFIG_FILE); }

  readConfigContent(project: string): string | null {
    return readFileOrNull(this.getRunConfigPath(project));
  }

  async generateConfigWithAI(project: string): Promise<{success: boolean; content?: string; path: string; error?: string}> {
    return this.runConfigPrompt(project, RUN_CONFIG_CLAUDE_PROMPT);
  }

  async editConfigWithAI(project: string, userPrompt: string): Promise<{success: boolean; content?: string; path: string; error?: string}> {
    const current = this.readConfigContent(project) || '{}';
    // Single-pass substitution so a {USER_PROMPT} literal inside the config isn't
    // replaced by the user's text (or vice versa).
    const tokens: Record<string, string> = {'{CURRENT_CONFIG}': current, '{USER_PROMPT}': userPrompt};
    const prompt = SETTINGS_EDIT_CLAUDE_PROMPT.replace(/\{CURRENT_CONFIG\}|\{USER_PROMPT\}/g, m => tokens[m]);
    return this.runConfigPrompt(project, prompt);
  }

  applyConfig(project: string, content: string): {success: boolean; error?: string} {
    try { JSON.parse(content); } catch (e) {
      return {success: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`};
    }
    try {
      this.git.writeRunConfig(project, content);
      return {success: true};
    } catch (e) {
      return {success: false, error: e instanceof Error ? e.message : String(e)};
    }
  }

  private async runConfigPrompt(project: string, prompt: string): Promise<{success: boolean; content?: string; path: string; error?: string}> {
    const projectPath = path.join(this.git.basePath, project);
    const cfgPath = this.getRunConfigPath(project);
    const result = await runClaudeAsync(prompt, {cwd: projectPath});
    if (!result.success) return {success: false, path: cfgPath, error: result.error || 'Claude failed'};
    const extracted = extractJsonObject(result.output);
    if (!extracted) return {success: false, path: cfgPath, error: 'Claude response was not valid JSON'};
    return {success: true, content: extracted, path: cfgPath};
  }

  // Internals
  private async refreshMemoryStatus(): Promise<void> { try { const m = await this.memory.getMemoryStatus(); this.setState({memoryStatus: m}); } catch {} }
  private async refreshVersionInfo(): Promise<void> {
    try {
      if (!this.versionService) {
        const mod = await import('../services/VersionCheckService.js');
        this.versionService = new (mod as any).VersionCheckService();
      }
      const info = await this.versionService.check();
      this.setState({versionInfo: info && info.hasUpdate ? info : null});
    } catch {}
  }

  private setupWorktreeEnvironment(projectName: string, worktreePath: string): void {
    const setup = this.readProjectConfig(projectName)?.worktreeSetup;
    if (setup) {
      // Config present (even if arrays are empty) means the user has opted in to
      // config-driven setup — honor it exactly. Missing/empty arrays = do nothing.
      for (const rel of setup.copyFiles || []) {
        if (typeof rel === 'string' && rel.trim()) {
          try { this.git.copyPath(projectName, worktreePath, rel); } catch {}
        }
      }
      for (const rel of setup.symlinkPaths || []) {
        if (typeof rel === 'string' && rel.trim()) {
          try { this.git.symlinkPath(projectName, worktreePath, rel); } catch {}
        }
      }
    } else {
      // No worktreeSetup section: fall back to the pre-config hardcoded behavior.
      try { this.git.copyEnvironmentFile(projectName, worktreePath); } catch {}
      try { this.git.linkClaudeSettings(projectName, worktreePath); } catch {}
    }
    // Best-effort: show tmux display message
    try { runCommandQuick(['tmux', 'display-message', '-d', `${TMUX_DISPLAY_TIME}`, `Created ${worktreePath}`]); } catch {}
  }

  private readProjectConfig(project: string): ProjectConfig | null {
    const raw = this.readConfigContent(project);
    if (!raw) return null;
    try { return JSON.parse(raw) as ProjectConfig; } catch { return null; }
  }

  private getAIToolFlags(project: string, tool: AITool): string[] {
    if (tool === 'none') return [];
    const entry = this.readProjectConfig(project)?.aiToolSettings?.[tool];
    const flags = entry?.flags;
    return Array.isArray(flags) ? flags.filter((f) => typeof f === 'string' && f.length > 0) : [];
  }

  private async terminateFeatureSessions(projectName: string, featureName: string): Promise<void> {
    const s = this.tmux.sessionName(projectName, featureName);
    const sh = this.tmux.shellSessionName(projectName, featureName);
    const rn = this.tmux.runSessionName(projectName, featureName);
    const active = await this.tmux.listSessions();
    for (const name of [s, sh, rn]) { if (active.includes(name)) this.tmux.killSession(name); }
  }

  private launchClaudeSessionWithFallback(sessionName: string, cwd: string, flagStr: string = ''): void {
    const continueCmd = aiLaunchCommand('claude') + flagStr;
    const fallbackCmd = 'claude' + flagStr;
    this.tmux.createSessionWithCommand(sessionName, cwd, `${continueCmd} || ${fallbackCmd}`, true);
  }

  private setState(partial: Partial<State>): void {
    this.state = Object.freeze({...this.state, ...partial});
    for (const l of this.listeners) l(this.state);
  }
}
