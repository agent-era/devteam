import React, {createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo} from 'react';
import path from 'node:path';
import fs from 'node:fs';
import {WorktreeInfo, GitStatus, SessionInfo, ProjectInfo} from '../models.js';
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
  runInteractive,
  runClaudeSync
} from '../utils.js';
import {useInputFocus} from './InputFocusContext.js';

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
  refresh: () => void;
  refreshSelected: () => void;
  
  // Worktree operations
  createFeature: (projectName: string, featureName: string) => Promise<WorktreeInfo | null>;
  createFromBranch: (project: string, remoteBranch: string, localName: string) => Promise<boolean>;
  archiveFeature: (worktreeOrProject: WorktreeInfo | string, worktreePath?: string, feature?: string) => Promise<{archivedPath: string}>;
  deleteArchived: (archivedPath: string) => Promise<boolean>;
  
  // Session operations  
  attachSession: (worktree: WorktreeInfo) => void;
  attachShellSession: (worktree: WorktreeInfo) => void;
  attachRunSession: (worktree: WorktreeInfo) => 'success' | 'no_config';
  
  // Projects
  discoverProjects: () => ProjectInfo[];
  getArchivedForProject: (project: ProjectInfo) => Array<any>;
  
  // Run configuration
  getRunConfigPath: (project: string) => string;
  createOrFillRunConfig: (project: string) => Promise<{success: boolean; content?: string; path: string; error?: string}>;
}

const WorktreeContext = createContext<WorktreeContextType | null>(null);

interface WorktreeProviderProps {
  children: ReactNode;
}

export function WorktreeProvider({children}: WorktreeProviderProps) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const {isAnyDialogFocused} = useInputFocus();

  // Service instances - stable across re-renders
  const gitService = useMemo(() => new GitService(), []);
  const tmuxService = useMemo(() => new TmuxService(), []);

  const collectWorktrees = useCallback((): Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string; 
    mtime?: number
  }> => {
    const projects = gitService.discoverProjects();
    const rows = [];
    for (const project of projects) {
      const worktrees = gitService.getWorktreesForProject(project);
      for (const wt of worktrees) rows.push(wt);
    }
    return rows;
  }, [gitService]);

  const attachRuntimeData = useCallback((list: Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string
  }>): WorktreeInfo[] => {
    return list.map((w: any) => {
      const gitStatus = gitService.getGitStatus(w.path);
      const sessionName = tmuxService.sessionName(w.project, w.feature);
      const activeSessions = tmuxService.listSessions();
      const attached = activeSessions.includes(sessionName);
      const claudeStatus = attached ? tmuxService.getClaudeStatus(sessionName) : 'not_running';
      
      const sessionInfo = new SessionInfo({
        session_name: sessionName,
        attached,
        claude_status: claudeStatus
      });
      
      return new WorktreeInfo({
        project: w.project,
        feature: w.feature,
        path: w.path,
        branch: w.branch,
        git: gitStatus,
        session: sessionInfo,
        mtime: w.mtime || 0,
      });
    });
  }, [gitService, tmuxService]);

  const refresh = useCallback(() => {
    if (loading) return;
    setLoading(true);
    
    try {
      const rawList = collectWorktrees();
      const enrichedList = attachRuntimeData(rawList);
      setWorktrees(enrichedList);
      setLastRefreshed(Date.now());
    } catch (error) {
      console.error('Failed to refresh worktrees:', error);
    } finally {
      setLoading(false);
    }
  }, [loading, collectWorktrees, attachRuntimeData]);

  const refreshSelected = useCallback(() => {
    const selected = worktrees[selectedIndex];
    if (!selected) return;
    
    try {
      const gitStatus = gitService.getGitStatus(selected.path);
      const sessionName = tmuxService.sessionName(selected.project, selected.feature);
      const activeSessions = tmuxService.listSessions();
      const attached = activeSessions.includes(sessionName);
      const claudeStatus = attached ? tmuxService.getClaudeStatus(sessionName) : 'not_running';
      
      const updatedWorktrees = [...worktrees];
      updatedWorktrees[selectedIndex] = new WorktreeInfo({
        ...selected,
        git: gitStatus,
        session: new SessionInfo({
          session_name: sessionName,
          attached,
          claude_status: claudeStatus
        })
      });
      
      setWorktrees(updatedWorktrees);
    } catch (error) {
      console.error('Failed to refresh selected worktree:', error);
    }
  }, [worktrees, selectedIndex, gitService, tmuxService]);

  // Operations
  const createFeature = useCallback(async (projectName: string, featureName: string): Promise<WorktreeInfo | null> => {
    setLoading(true);
    try {
      const created = gitService.createWorktree(projectName, featureName);
      if (!created) return null;

      const worktreePath = path.join(BASE_PATH, `${projectName}${DIR_BRANCHES_SUFFIX}`, featureName);
      
      setupWorktreeEnvironment(projectName, worktreePath);
      createTmuxSession(projectName, featureName, worktreePath);
      
      refresh();
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
      
      refresh();
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
      
      terminateFeatureSessions(project, featureName);
      
      const archivedRoot = path.join(BASE_PATH, `${project}${DIR_ARCHIVED_SUFFIX}`);
      ensureDirectory(archivedRoot);
      
      const timestamp = generateTimestamp();
      const archivedDest = path.join(archivedRoot, `${ARCHIVE_PREFIX}${timestamp}_${featureName}`);

      moveWorktreeToArchive(workPath, archivedDest);
      pruneWorktreeReferences(project);

      refresh();
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

  const attachSession = useCallback((worktree: WorktreeInfo) => {
    const sessionName = tmuxService.sessionName(worktree.project, worktree.feature);
    const activeSessions = tmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      createTmuxSession(worktree.project, worktree.feature, worktree.path);
    }
    
    configureTmuxDisplayTime();
    runInteractive('tmux', ['attach-session', '-t', sessionName]);
  }, [tmuxService]);

  const attachShellSession = useCallback((worktree: WorktreeInfo) => {
    const sessionName = tmuxService.shellSessionName(worktree.project, worktree.feature);
    const activeSessions = tmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      createShellSession(worktree.project, worktree.feature, worktree.path);
    }
    
    configureTmuxDisplayTime();
    runInteractive('tmux', ['attach-session', '-t', sessionName]);
  }, [tmuxService]);

  const attachRunSession = useCallback((worktree: WorktreeInfo): 'success' | 'no_config' => {
    const projectPath = path.join(BASE_PATH, worktree.project);
    const configPath = path.join(projectPath, RUN_CONFIG_FILE);
    
    // Check if config exists before creating session
    if (!fs.existsSync(configPath)) {
      return 'no_config';
    }

    const sessionName = tmuxService.runSessionName(worktree.project, worktree.feature);
    const activeSessions = tmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      createRunSession(worktree.project, worktree.feature, worktree.path);
    }
    
    configureTmuxDisplayTime();
    runInteractive('tmux', ['attach-session', '-t', sessionName]);
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

  const createTmuxSession = useCallback((project: string, feature: string, cwd: string): string => {
    const sessionName = tmuxService.sessionName(project, feature);
    
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd]);
    configureTmuxDisplayTime();
    startClaudeIfAvailable(sessionName);
    
    return sessionName;
  }, [tmuxService]);

  const createShellSession = useCallback((project: string, feature: string, cwd: string): string => {
    const sessionName = tmuxService.shellSessionName(project, feature);
    const shell = process.env.SHELL || '/bin/bash';
    
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd, shell]);
    configureTmuxDisplayTime();
    
    return sessionName;
  }, [tmuxService]);

  const createRunSession = useCallback((project: string, feature: string, cwd: string): string => {
    const sessionName = tmuxService.runSessionName(project, feature);
    const projectPath = path.join(BASE_PATH, project);
    const configPath = path.join(projectPath, RUN_CONFIG_FILE);
    
    // Create detached session at cwd
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd]);
    configureTmuxDisplayTime();
    
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      // Run setup commands if they exist
      if (config.setup && Array.isArray(config.setup)) {
        for (const setupCmd of config.setup) {
          runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, setupCmd, 'C-m']);
        }
      }
      
      // Set environment variables if they exist
      if (config.env && typeof config.env === 'object') {
        for (const [key, value] of Object.entries(config.env)) {
          runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, `export ${key}="${value}"`, 'C-m']);
        }
      }
      
      // Run the main command
      if (config.command) {
        if (config.watch === false) {
          // For non-watch commands (builds, tests), let session exit when command finishes
          runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, config.command, 'C-m']);
        } else {
          // For watch commands (servers, dev), keep session alive after command exits
          runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, `${config.command}; exec bash`, 'C-m']);
        }
      }
    } catch (error) {
      // Config file exists but is invalid, show error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, `echo "Invalid run config at ${configPath}: ${errorMessage}"`, 'C-m']);
    }
    
    return sessionName;
  }, [tmuxService]);

  const terminateFeatureSessions = useCallback((projectName: string, featureName: string) => {
    const sessionName = tmuxService.sessionName(projectName, featureName);
    const activeSessions = tmuxService.listSessions();
    
    if (activeSessions.includes(sessionName)) {
      runCommand(['tmux', 'kill-session', '-t', sessionName]);
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
    runCommand(['tmux', 'set-option', '-g', 'display-time', String(TMUX_DISPLAY_TIME)]);
  }, []);

  const startClaudeIfAvailable = useCallback((sessionName: string) => {
    const hasClaude = !!runCommandQuick(['bash', '-lc', 'command -v claude || true']);
    if (hasClaude) {
      runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'claude', 'C-m']);
    }
  }, []);

  // Auto-refresh intervals
  useEffect(() => {
    const shouldRefresh = Date.now() - lastRefreshed > CACHE_DURATION;
    if (shouldRefresh && worktrees.length === 0) {
      refresh();
    }
  }, [lastRefreshed, worktrees.length, refresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Skip AI status refresh if any dialog is focused to avoid interrupting typing
      if (!isAnyDialogFocused) {
        refreshSelected();
      }
    }, AI_STATUS_REFRESH_DURATION);
    return () => clearInterval(interval);
  }, [refreshSelected, isAnyDialogFocused]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Skip diff status refresh if any dialog is focused to avoid interrupting typing
      if (!isAnyDialogFocused) {
        refresh();
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
    refreshSelected,
    
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