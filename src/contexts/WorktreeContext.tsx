import React, {createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo} from 'react';
import path from 'node:path';
import fs from 'node:fs';
import {WorktreeInfo, GitStatus, SessionInfo, ProjectInfo, PRStatus} from '../models.js';
import {GitService} from '../services/GitService.js';
import {TmuxService} from '../services/TmuxService.js';
import {
  CACHE_DURATION,
  AI_STATUS_REFRESH_DURATION,
  DIFF_STATUS_REFRESH_DURATION,
  BASE_PATH,
  DIR_BRANCHES_SUFFIX,
  DIR_ARCHIVED_SUFFIX,
  ARCHIVE_PREFIX,
  ENV_FILE,
  CLAUDE_SETTINGS_FILE,
  RUN_CONFIG_FILE,
  RUN_CONFIG_CLAUDE_PROMPT,
  TMUX_DISPLAY_TIME,
} from '../constants.js';
import {
  ensureDirectory,
  runCommand,
  runCommandQuick,
  copyWithIgnore,
  generateTimestamp,
  runClaudeSync
} from '../utils.js';
import {useInputFocus} from './InputFocusContext.js';
import {useGitHubContext} from './GitHubContext.js';
import {logDebug} from '../shared/utils/logger.js';
import {Timer} from '../shared/utils/timing.js';

const h = React.createElement;

interface WorktreeContextType {
  // State
  worktrees: WorktreeInfo[];
  loading: boolean;
  lastRefreshed: number;
  selectedIndex: number;
  
  // Navigation
  selectWorktree: (index: number) => void;
  getSelectedWorktree: () => WorktreeInfo | null;
  
  // Data operations
  refresh: (refreshPRs?: 'all' | 'visible' | 'none') => Promise<void>;
  forceRefreshVisible: (currentPage: number, pageSize: number) => Promise<void>;
  refreshSelected: () => void;
  refreshPRSelective: () => Promise<void>;
  
  // Worktree operations
  createFeature: (projectName: string, featureName: string) => Promise<WorktreeInfo | null>;
  createFromBranch: (project: string, remoteBranch: string, localName: string) => Promise<boolean>;
  archiveFeature: (worktreeOrProject: WorktreeInfo | string, path?: string, feature?: string) => Promise<{archivedPath: string}>;
  deleteArchived: (archivedPath: string) => Promise<boolean>;
  
  // Session operations  
  attachSession: (worktree: WorktreeInfo) => Promise<void>;
  attachShellSession: (worktree: WorktreeInfo) => Promise<void>;
  attachRunSession: (worktree: WorktreeInfo) => Promise<'success' | 'no_config'>;
  
  // Projects
  discoverProjects: () => ProjectInfo[];
  getArchivedForProject: (project: ProjectInfo) => Array<any>;
  getRemoteBranches: (project: string) => Promise<Array<Record<string, any>>>;
  
  // Run configuration
  getRunConfigPath: (project: string) => string;
  createOrFillRunConfig: (project: string) => Promise<{success: boolean; content?: string; path: string; error?: string}>;
}

const WorktreeContext = createContext<WorktreeContextType | null>(null);

interface WorktreeProviderProps {
  children: ReactNode;
}

export function WorktreeProvider({
  children
}: WorktreeProviderProps) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const {isAnyDialogFocused} = useInputFocus();
  
  // Access GitHub context directly instead of through props
  const {getPRStatus, setVisibleWorktrees, refreshPRStatus, refreshPRForWorktree, forceRefreshVisiblePRs} = useGitHubContext();

  // Service instances - stable across re-renders
  const gitService = useMemo(() => new GitService(), []);
  const tmuxService = useMemo(() => new TmuxService(), []);

  const collectWorktrees = useCallback(async (): Promise<Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string; 
    mtime?: number
  }>> => {
    const projects = gitService.discoverProjects();
    
    // Run worktree collection for all projects in parallel
    const allWorktreePromises = projects.map(project => 
      gitService.getWorktreesForProject(project)
    );
    
    const allWorktrees = await Promise.all(allWorktreePromises);
    
    // Flatten the results
    const rows = [];
    for (const worktrees of allWorktrees) {
      for (const wt of worktrees) rows.push(wt);
    }
    
    return rows;
  }, [gitService]);

  const attachRuntimeData = useCallback(async (list: Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string
  }>, getPRStatus?: (path: string) => any): Promise<WorktreeInfo[]> => {
    // Get existing worktrees to preserve idle timers and kill flags
    const existingWorktrees = new Map(worktrees.map(w => [`${w.project}/${w.feature}`, w]));
    
    // Get tmux sessions once for all worktrees
    const activeSessions = await tmuxService.listSessions();
    
    // Create promises for all git status and claude status checks
    const promises = list.map(async (w: any) => {
      const key = `${w.project}/${w.feature}`;
      const existing = existingWorktrees.get(key);
      
      // Run git status and claude status in parallel
      const sessionName = tmuxService.sessionName(w.project, w.feature);
      const attached = activeSessions.includes(sessionName);
      
      const [gitStatus, claudeStatus] = await Promise.all([
        gitService.getGitStatus(w.path),
        attached ? tmuxService.getClaudeStatus(sessionName) : Promise.resolve('not_running' as const)
      ]);
      
      // Track idle time for ALL worktrees and kill after 30 minutes
      let idleStartTime = existing?.idleStartTime;
      let wasKilledIdle = existing?.wasKilledIdle || false;
      
      if (claudeStatus === 'idle') {
        if (!idleStartTime) {
          idleStartTime = Date.now();
        }
        const idleMinutes = (Date.now() - idleStartTime) / 60000;
        
        if (idleMinutes > 30) {
          // Kill idle session to free memory and mark it as killed
          tmuxService.killSession(sessionName);
          idleStartTime = null;
          wasKilledIdle = true;
        }
      } else {
        idleStartTime = null; // Reset when not idle
        // Keep wasKilledIdle flag until session is recreated
      }
      
      // Reset wasKilledIdle flag if session is now active (was recreated)
      if (attached && wasKilledIdle) {
        wasKilledIdle = false;
      }
      
      const sessionInfo = new SessionInfo({
        session_name: sessionName,
        attached,
        claude_status: claudeStatus
      });

      // Get PR status if available, otherwise create with 'not_checked' status
      const prStatus = getPRStatus ? getPRStatus(w.path) : new PRStatus({ loadingStatus: 'not_checked' });
      
      return new WorktreeInfo({
        project: w.project,
        feature: w.feature,
        path: w.path,
        branch: w.branch,
        git: gitStatus,
        session: sessionInfo,
        idleStartTime,
        wasKilledIdle,
        pr: prStatus,
        mtime: w.mtime || 0,
      });
    });
    
    // Wait for all worktree data to be processed in parallel
    const result = await Promise.all(promises);
    
    return result;
  }, [gitService, tmuxService, worktrees]);

  const refresh = useCallback(async (refreshPRs: 'all' | 'visible' | 'none' = 'all') => {
    if (loading) {
      logDebug(`[Refresh.Full] Skipped - already loading`);
      return;
    }
    
    const timer = new Timer();
    setLoading(true);
    
    try {
      logDebug(`[Refresh.Full] Starting complete refresh`);
      
      const rawList = await collectWorktrees();
      const enrichedList = await attachRuntimeData(rawList, getPRStatus);
      setWorktrees(enrichedList);
      setLastRefreshed(Date.now());
      
      // Signal visible worktrees to GitHub context for selective refresh
      if (setVisibleWorktrees) {
        const visiblePaths = enrichedList.map(wt => wt.path);
        setVisibleWorktrees(visiblePaths);
        }
      
      // Refresh PR status based on parameter
      if (refreshPRStatus && refreshPRs !== 'none') {
        const visibleOnly = refreshPRs === 'visible';
        await refreshPRStatus(enrichedList, visibleOnly);
        
        // Update worktrees with fresh PR data after refresh completes
        const updatedWorktrees = enrichedList.map(wt => new WorktreeInfo({
          ...wt,
          pr: getPRStatus(wt.path)
        }));
        setWorktrees(updatedWorktrees);
      }
      
      const timing = timer.elapsed();
      logDebug(`[Refresh.Full] Complete: ${enrichedList.length} worktrees in ${timing.formatted}`);
      
    } catch (error) {
      const timing = timer.elapsed();
      logDebug(`[Refresh.Full] Failed in ${timing.formatted}: ${error instanceof Error ? error.message : String(error)}`);
      console.error('Failed to refresh worktrees:', error);
    } finally {
      setLoading(false);
    }
  }, [loading, collectWorktrees, attachRuntimeData, getPRStatus, setVisibleWorktrees, refreshPRStatus]);

  const forceRefreshVisible = useCallback(async (currentPage: number, pageSize: number) => {
    if (loading || worktrees.length === 0) return;
    
    // Calculate visible worktrees based on pagination
    const startIndex = currentPage * pageSize;
    const endIndex = Math.min(startIndex + pageSize, worktrees.length);
    const visibleWorktrees = worktrees.slice(startIndex, endIndex);
    
    if (visibleWorktrees.length === 0) return;
    
    logInfo(`[Force Refresh] Refreshing ${visibleWorktrees.length} visible PRs on page ${currentPage + 1}`);
    
    try {
      // Force refresh visible PRs by invalidating their cache first
      await forceRefreshVisiblePRs(visibleWorktrees);
      
      // Update worktrees with fresh PR data
      const updatedWorktrees = [...worktrees];
      for (let i = startIndex; i < endIndex; i++) {
        if (updatedWorktrees[i]) {
          updatedWorktrees[i] = new WorktreeInfo({
            ...updatedWorktrees[i],
            pr: getPRStatus(updatedWorktrees[i].path)
          });
        }
      }
      setWorktrees(updatedWorktrees);
      setLastRefreshed(Date.now());
    } catch (error) {
      console.error('Failed to force refresh visible PRs:', error);
    }
  }, [loading, worktrees, forceRefreshVisiblePRs, getPRStatus]);

  const refreshSelected = useCallback(async () => {
    const selected = worktrees[selectedIndex];
    if (!selected) return;
    
    try {
      const sessionName = tmuxService.sessionName(selected.project, selected.feature);
      const activeSessions = await tmuxService.listSessions();
      const attached = activeSessions.includes(sessionName);
      
      // Run git status and claude status in parallel
      const [gitStatus, claudeStatus] = await Promise.all([
        gitService.getGitStatus(selected.path),
        attached ? tmuxService.getClaudeStatus(sessionName) : Promise.resolve('not_running' as const)
      ]);
      
      // Detect push (ahead count went from >0 to 0) and invalidate PR cache
      const previousAhead = selected.git?.ahead || 0;
      const currentAhead = gitStatus.ahead || 0;
      
      if (previousAhead > 0 && currentAhead === 0) {
        // A push occurred - invalidate PR cache and refresh
        const pr = getPRStatus(selected.path);
        if (pr && pr.state === 'OPEN' && refreshPRForWorktree) {
          logDebug(`Detected push for ${selected.feature}, invalidating PR cache and refreshing`);
          // The GitHubContext will handle cache invalidation in refreshPRForWorktree
          await refreshPRForWorktree(selected.path);
        }
      }
      
      const updatedWorktrees = [...worktrees];
      updatedWorktrees[selectedIndex] = new WorktreeInfo({
        ...selected,
        git: gitStatus,
        session: new SessionInfo({
          session_name: sessionName,
          attached,
          claude_status: claudeStatus
        }),
        pr: getPRStatus(selected.path) // Update with possibly refreshed PR status
      });
      
      setWorktrees(updatedWorktrees);
      
      // Only log if status changed to working or waiting (interesting states)
      if (claudeStatus === 'working' || claudeStatus === 'waiting') {
        logDebug(`[Refresh.Selected] ${selected.feature}: ${claudeStatus}`);
      }
      
    } catch (error) {
      console.error('Failed to refresh selected worktree:', error);
    }
  }, [worktrees, selectedIndex, gitService, tmuxService, getPRStatus, refreshPRForWorktree]);

  const refreshPRSelective = useCallback(async () => {
    if (!refreshPRStatus) return;
    
    try {
      // Refresh PR status for visible worktrees only
      await refreshPRStatus(worktrees, true);
      
      // Update worktrees with fresh PR data
      const updatedWorktrees = worktrees.map(wt => new WorktreeInfo({
        ...wt,
        pr: getPRStatus(wt.path)
      }));
      
      setWorktrees(updatedWorktrees);
      
    } catch (error) {
      console.error('Failed to refresh PR status:', error);
    }
  }, [worktrees, refreshPRStatus, getPRStatus]);
  // Operations
  const createFeature = useCallback(async (projectName: string, featureName: string): Promise<WorktreeInfo | null> => {
    setLoading(true);
    try {
      const created = gitService.createWorktree(projectName, featureName);
      if (!created) return null;

      const worktreePath = path.join(BASE_PATH, `${projectName}${DIR_BRANCHES_SUFFIX}`, featureName);
      
      setupWorktreeEnvironment(projectName, worktreePath);
      createTmuxSession(projectName, featureName, worktreePath);
      
      await refresh();
      return new WorktreeInfo({
        project: projectName,
        feature: featureName,
        path: worktreePath,
        branch: `feature/${featureName}`
      });
    } finally {
      setLoading(false);
    }
  }, [gitService, refresh]);

  const createFromBranch = useCallback(async (project: string, remoteBranch: string, localName: string): Promise<boolean> => {
    setLoading(true);
    try {
      const created = gitService.createWorktreeFromRemote(project, remoteBranch, localName);
      if (!created) return false;

      const worktreePath = path.join(BASE_PATH, `${project}${DIR_BRANCHES_SUFFIX}`, localName);
      setupWorktreeEnvironment(project, worktreePath);
      createTmuxSession(project, localName, worktreePath);
      
      await refresh();
      return true;
    } finally {
      setLoading(false);
    }
  }, [gitService, refresh]);

  const archiveFeature = useCallback(async (worktreeOrProject: WorktreeInfo | string, worktreePath?: string, feature?: string): Promise<{archivedPath: string}> => {
    setLoading(true);
    try {
      let project: string, workPath: string, featureName: string;
      
      if (typeof worktreeOrProject === 'string') {
        // Called with (project, path, feature) format
        project = worktreeOrProject;
        workPath = worktreePath!;
        featureName = feature!;
      } else {
        // Called with WorktreeInfo object
        project = worktreeOrProject.project;
        workPath = worktreeOrProject.path;
        featureName = worktreeOrProject.feature;
      }
      
      await terminateFeatureSessions(project, featureName);
      
      const archivedRoot = path.join(BASE_PATH, `${project}${DIR_ARCHIVED_SUFFIX}`);
      ensureDirectory(archivedRoot);
      
      const timestamp = generateTimestamp();
      const archivedDest = path.join(archivedRoot, `${ARCHIVE_PREFIX}${timestamp}_${featureName}`);

      moveWorktreeToArchive(workPath, archivedDest);
      pruneWorktreeReferences(project);

      await refresh();
      return {archivedPath: archivedDest};
    } finally {
      setLoading(false);
    }
  }, [tmuxService, refresh]);

  const deleteArchived = useCallback(async (archivedPath: string): Promise<boolean> => {
    try {
      fs.rmSync(archivedPath, {recursive: true, force: true});
      return true;
    } catch {
      return false;
    }
  }, []);

  const attachSession = useCallback(async (worktree: WorktreeInfo) => {
    const sessionName = tmuxService.sessionName(worktree.project, worktree.feature);
    const activeSessions = await tmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      const hasClaude = !!runCommandQuick(['bash', '-lc', 'command -v claude || true']);
      
      if (hasClaude) {
        // Create session with Claude directly as the command
        const claudeCmd = worktree.wasKilledIdle ? 'claude "/resume"' : 'claude';
        tmuxService.createSessionWithCommand(sessionName, worktree.path, claudeCmd, true);
      } else {
        // No Claude available, create regular bash session with auto-exit
        tmuxService.createSession(sessionName, worktree.path, true);
      }
      
      configureTmuxDisplayTime();
    }
    
    configureTmuxDisplayTime();
    tmuxService.attachSessionInteractive(sessionName);
  }, [tmuxService]);

  const attachShellSession = useCallback(async (worktree: WorktreeInfo) => {
    const sessionName = tmuxService.shellSessionName(worktree.project, worktree.feature);
    const activeSessions = await tmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      createShellSession(worktree.project, worktree.feature, worktree.path);
    }
    
    configureTmuxDisplayTime();
    tmuxService.attachSessionInteractive(sessionName);
  }, [tmuxService]);

  const attachRunSession = useCallback(async (worktree: WorktreeInfo): Promise<'success' | 'no_config'> => {
    const projectPath = path.join(BASE_PATH, worktree.project);
    const configPath = path.join(projectPath, RUN_CONFIG_FILE);
    
    // Check if config exists before creating session
    if (!fs.existsSync(configPath)) {
      return 'no_config';
    }

    const sessionName = tmuxService.runSessionName(worktree.project, worktree.feature);
    const activeSessions = await tmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      createRunSession(worktree.project, worktree.feature, worktree.path);
    }
    
    configureTmuxDisplayTime();
    tmuxService.attachSessionInteractive(sessionName);
    return 'success';
  }, [tmuxService]);

  const selectWorktree = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const getSelectedWorktree = useCallback((): WorktreeInfo | null => {
    return worktrees[selectedIndex] || null;
  }, [worktrees, selectedIndex]);

  const discoverProjects = useCallback((): ProjectInfo[] => {
    return gitService.discoverProjects();
  }, [gitService]);

  const getArchivedForProject = useCallback((project: ProjectInfo) => {
    return gitService.getArchivedForProject(project);
  }, [gitService]);

  const getRemoteBranches = useCallback((project: string): Promise<Array<Record<string, any>>> => {
    return gitService.getRemoteBranches(project);
  }, [gitService]);

  const getRunConfigPath = useCallback((project: string): string => {
    const projectPath = path.join(BASE_PATH, project);
    return path.join(projectPath, RUN_CONFIG_FILE);
  }, []);

  const createOrFillRunConfig = useCallback(async (project: string): Promise<{success: boolean; content?: string; path: string; error?: string}> => {
    const projectPath = path.join(BASE_PATH, project);
    const configPath = path.join(projectPath, RUN_CONFIG_FILE);
    
    // Check if Claude CLI is available
    const hasClaude = !!runCommandQuick(['bash', '-lc', 'command -v claude || true']);
    if (!hasClaude) {
      return {
        success: false,
        path: configPath,
        error: 'Claude CLI not available. Please install it first.'
      };
    }
    
    // Use Claude to generate the config
    const claudeResult = runClaudeSync(RUN_CONFIG_CLAUDE_PROMPT, projectPath);
    
    if (!claudeResult.success) {
      return {
        success: false,
        path: configPath,
        error: claudeResult.error || 'Claude command failed'
      };
    }
    
    let output = claudeResult.output;
    if (!output || !output.trim()) {
      return {
        success: false,
        path: configPath,
        error: 'Claude returned no output'
      };
    }
    
    // Strip markdown code blocks if Claude added them
    output = output.replace(/^```json\\s*\\n?/, '').replace(/\\n?```$/, '').trim();
    
    // Validate that it's valid JSON
    try {
      JSON.parse(output);
    } catch (jsonError) {
      return {
        success: false,
        content: output,
        path: configPath,
        error: 'Generated content is not valid JSON'
      };
    }
    
    // Write the output to the config file
    try {
      fs.writeFileSync(configPath, output);
      return {
        success: true,
        content: output,
        path: configPath
      };
    } catch (writeError) {
      const errorMessage = writeError instanceof Error ? writeError.message : 'Unknown error';
      return {
        success: false,
        content: output,
        path: configPath,
        error: `Failed to write config file: ${errorMessage}`
      };
    }
  }, []);

  // Helper methods for WorktreeService operations
  const setupWorktreeEnvironment = useCallback((projectName: string, worktreePath: string) => {
    const projectPath = path.join(BASE_PATH, projectName);
    
    copyEnvironmentFile(projectPath, worktreePath);
    copyClaudeSettings(projectPath, worktreePath);
    copyClaudeDocumentation(projectPath, worktreePath);
  }, []);

  const createTmuxSession = useCallback((project: string, feature: string, cwd: string, command?: string): string => {
    const sessionName = tmuxService.sessionName(project, feature);
    
    if (command) {
      // Create session with specific command and auto-exit
      tmuxService.createSessionWithCommand(sessionName, cwd, command, true);
    } else {
      // Create session and start Claude if available
      const hasClaude = !!runCommandQuick(['bash', '-lc', 'command -v claude || true']);
      if (hasClaude) {
        tmuxService.createSessionWithCommand(sessionName, cwd, 'claude', true);
      } else {
        tmuxService.createSession(sessionName, cwd, true);
      }
    }
    
    configureTmuxDisplayTime();
    
    return sessionName;
  }, [tmuxService]);

  const createShellSession = useCallback((project: string, feature: string, cwd: string): string => {
    const sessionName = tmuxService.shellSessionName(project, feature);
    const shell = process.env.SHELL || '/bin/bash';
    
    tmuxService.createSessionWithCommand(sessionName, cwd, shell, true);
    configureTmuxDisplayTime();
    
    return sessionName;
  }, [tmuxService]);

  const createRunSession = useCallback((project: string, feature: string, cwd: string): string => {
    const sessionName = tmuxService.runSessionName(project, feature);
    const projectPath = path.join(BASE_PATH, project);
    const configPath = path.join(projectPath, RUN_CONFIG_FILE);
    
    // Create detached session at cwd
    tmuxService.createSession(sessionName, cwd);
    // Auto-destroy session when program exits
    tmuxService.setSessionOption(sessionName, 'remain-on-exit', 'off');
    configureTmuxDisplayTime();
    
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      // Run setup commands if they exist
      if (config.setup && Array.isArray(config.setup)) {
        for (const setupCmd of config.setup) {
          tmuxService.sendText(sessionName, setupCmd, { executeCommand: true });
        }
      }
      
      // // Set environment variables if they exist
      // if (config.env && typeof config.env === 'object') {
      //   for (const [key, value] of Object.entries(config.env)) {
      //     tmuxService.sendText(sessionName, `export ${key}="${value}"`, { executeCommand: true });
      //   }
      // }
      
      // Run the main command
      if (config.command) {
        if (config.watch === false) {
          // For non-watch commands (builds, tests), use exec to replace bash and exit when command finishes
          tmuxService.sendText(sessionName, `exec ${config.command}`, { executeCommand: true });
        } else {
          // For watch commands (servers, dev), keep session alive after command exits
          tmuxService.sendText(sessionName, config.command, { executeCommand: true });
        }
      }
    } catch (error) {
      // Config file exists but is invalid, show error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      tmuxService.sendText(sessionName, `echo "Invalid run config at ${configPath}: ${errorMessage}"`, { executeCommand: true });
    }
    
    return sessionName;
  }, [tmuxService]);

  const terminateFeatureSessions = useCallback(async (projectName: string, featureName: string) => {
    const sessionName = tmuxService.sessionName(projectName, featureName);
    const shellSessionName = tmuxService.shellSessionName(projectName, featureName);
    const runSessionName = tmuxService.runSessionName(projectName, featureName);
    const activeSessions = await tmuxService.listSessions();
    
    // Kill all three session types
    if (activeSessions.includes(sessionName)) {
      tmuxService.killSession(sessionName);
    }
    if (activeSessions.includes(shellSessionName)) {
      tmuxService.killSession(shellSessionName);
    }
    if (activeSessions.includes(runSessionName)) {
      tmuxService.killSession(runSessionName);
    }
  }, [tmuxService]);

  const moveWorktreeToArchive = useCallback((worktreePath: string, archivedDest: string) => {
    try {
      fs.renameSync(worktreePath, archivedDest);
    } catch {
      // Fallback: copy then remove
      copyWithIgnore(worktreePath, archivedDest);
      fs.rmSync(worktreePath, {recursive: true, force: true});
    }
  }, []);

  const pruneWorktreeReferences = useCallback((projectName: string) => {
    const projectPath = path.join(BASE_PATH, projectName);
    runCommand(['git', '-C', projectPath, 'worktree', 'prune']);
  }, []);

  const copyEnvironmentFile = useCallback((projectPath: string, worktreePath: string) => {
    const envSrc = path.join(projectPath, ENV_FILE);
    const envDst = path.join(worktreePath, ENV_FILE);
    
    if (fs.existsSync(envSrc)) {
      ensureDirectory(path.dirname(envDst));
      fs.copyFileSync(envSrc, envDst);
    }
  }, []);

  const copyClaudeSettings = useCallback((projectPath: string, worktreePath: string) => {
    // Create symlink to .claude directory instead of copying
    const claudeDirSrc = path.join(projectPath, '.claude');
    const claudeDirDst = path.join(worktreePath, '.claude');
    
    if (fs.existsSync(claudeDirSrc)) {
      // Remove existing .claude if it exists (in case it was previously copied)
      if (fs.existsSync(claudeDirDst)) {
        fs.rmSync(claudeDirDst, { recursive: true, force: true });
      }
      // Create symlink to the original .claude directory
      fs.symlinkSync(claudeDirSrc, claudeDirDst, 'dir');
    }
  }, []);

  const copyClaudeDocumentation = useCallback((projectPath: string, worktreePath: string) => {
    const claudeDoc = path.join(projectPath, 'CLAUDE.md');
    const claudeDestDoc = path.join(worktreePath, 'CLAUDE.md');
    
    if (fs.existsSync(claudeDoc)) {
      fs.copyFileSync(claudeDoc, claudeDestDoc);
    }
  }, []);

  const configureTmuxDisplayTime = useCallback(() => {
    tmuxService.setOption('display-time', String(TMUX_DISPLAY_TIME));
  }, [tmuxService]);

  // Auto-refresh intervals
  useEffect(() => {
    const shouldRefresh = Date.now() - lastRefreshed > CACHE_DURATION;
    if (shouldRefresh) {
      refresh().catch(error => {
        console.error('Auto-refresh failed:', error);
      });
    }
  }, [lastRefreshed, refresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Skip AI status refresh if any dialog is focused to avoid interrupting typing
      if (!isAnyDialogFocused) {
        refreshSelected().catch(error => {
          console.error('Selected refresh failed:', error);
        });
      }
    }, AI_STATUS_REFRESH_DURATION);
    return () => clearInterval(interval);
  }, [refreshSelected, isAnyDialogFocused]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Skip diff status refresh if any dialog is focused to avoid interrupting typing
      if (!isAnyDialogFocused) {
        refresh().catch(error => {
          console.error('Diff status refresh failed:', error);
        });
      }
    }, DIFF_STATUS_REFRESH_DURATION);
    return () => clearInterval(interval);
  }, [refresh, isAnyDialogFocused]);

  const contextValue: WorktreeContextType = {
    // State
    worktrees,
    loading,
    lastRefreshed,
    selectedIndex,
    
    // Navigation
    selectWorktree,
    getSelectedWorktree,
    
    // Data operations
    refresh,
    forceRefreshVisible,
    refreshSelected,
    refreshPRSelective,
    
    // Worktree operations
    createFeature,
    createFromBranch,
    archiveFeature,
    deleteArchived,
    
    // Session operations
    attachSession,
    attachShellSession,
    attachRunSession,
    
    
    // Projects
    discoverProjects,
    getArchivedForProject,
    getRemoteBranches,
    
    // Run configuration
    getRunConfigPath,
    createOrFillRunConfig
  };

  return h(WorktreeContext.Provider, {value: contextValue}, children);
}

export function useWorktreeContext(): WorktreeContextType {
  const context = useContext(WorktreeContext);
  if (!context) {
    throw new Error('useWorktreeContext must be used within a WorktreeProvider');
  }
  return context;
}