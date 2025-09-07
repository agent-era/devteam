import React, {createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo} from 'react';
import path from 'node:path';
import {WorktreeInfo, GitStatus, SessionInfo, ProjectInfo} from '../models.js';
import {GitService} from '../services/GitService.js';
import {TmuxService} from '../services/TmuxService.js';
import {MemoryMonitorService, MemoryStatus} from '../services/MemoryMonitorService.js';
import {mapLimit} from '../shared/utils/concurrency.js';
import {
  CACHE_DURATION,
  MEMORY_REFRESH_DURATION,
  DIR_BRANCHES_SUFFIX,
  DIR_ARCHIVED_SUFFIX,
  ARCHIVE_PREFIX,
  ENV_FILE,
  CLAUDE_SETTINGS_FILE,
  RUN_CONFIG_FILE,
  RUN_CONFIG_CLAUDE_PROMPT,
  TMUX_DISPLAY_TIME,
} from '../constants.js';
import {getProjectsDirectory} from '../config.js';
import {ensureDirectory, copyWithIgnore} from '../shared/utils/fileSystem.js';
import {generateTimestamp} from '../shared/utils/formatting.js';
import {runClaudeSync, detectAvailableAITools, runCommandQuick} from '../shared/utils/commandExecutor.js';
import {AI_TOOLS} from '../constants.js';
import type {AITool} from '../models.js';
import {useInputFocus} from './InputFocusContext.js';
import {useGitHubContext} from './GitHubContext.js';
import {logDebug} from '../shared/utils/logger.js';
import {Timer} from '../shared/utils/timing.js';


interface WorktreeContextType {
  // State
  worktrees: WorktreeInfo[];
  loading: boolean;
  lastRefreshed: number;
  selectedIndex: number;
  memoryStatus: MemoryStatus | null;
  
  // Navigation
  selectWorktree: (index: number) => void;
  getSelectedWorktree: () => WorktreeInfo | null;
  
  // Data operations
  refresh: (refreshPRs?: 'all' | 'visible' | 'none') => Promise<void>;
  refreshVisibleStatus: (currentPage: number, pageSize: number) => Promise<void>;
  forceRefreshVisible: (currentPage: number, pageSize: number) => Promise<void>;
  
  // Worktree operations
  createFeature: (projectName: string, featureName: string) => Promise<WorktreeInfo | null>;
  createFromBranch: (project: string, remoteBranch: string, localName: string) => Promise<boolean>;
  archiveFeature: (worktreeOrProject: WorktreeInfo | string, path?: string, feature?: string) => Promise<{archivedPath: string}>;
  
  
  // Session operations  
  attachSession: (worktree: WorktreeInfo, aiTool?: AITool) => Promise<void>;
  attachShellSession: (worktree: WorktreeInfo) => Promise<void>;
  attachRunSession: (worktree: WorktreeInfo) => Promise<'success' | 'no_config'>;
  
  // AI tool management
  getAvailableAITools: () => (keyof typeof AI_TOOLS)[];
  needsToolSelection: (worktree: WorktreeInfo) => Promise<boolean>;
  
  // Projects
  discoverProjects: () => ProjectInfo[];
  
  getRemoteBranches: (project: string) => Promise<Array<Record<string, any>>>;
  
  // Run configuration
  getRunConfigPath: (project: string) => string;
  createOrFillRunConfig: (project: string) => Promise<{success: boolean; content?: string; path: string; error?: string}>;
}

const WorktreeContext = createContext<WorktreeContextType | null>(null);

// Extracted decision helper for testability and clarity
export function shouldPromptForAITool(
  availableTools: (keyof typeof AI_TOOLS)[],
  sessionExists: boolean,
  worktreeTool?: AITool | null
): boolean {
  if (sessionExists) return false;
  if (worktreeTool && worktreeTool !== 'none') return false;
  return availableTools.length > 1;
}

interface WorktreeProviderProps {
  children: ReactNode;
  gitService?: GitService;
  tmuxService?: TmuxService;
  memoryMonitorService?: MemoryMonitorService;
}

export function WorktreeProvider({
  children,
  gitService: gitServiceOverride,
  tmuxService: tmuxServiceOverride,
  memoryMonitorService: memoryMonitorServiceOverride,
}: WorktreeProviderProps) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus | null>(null);
  const {isAnyDialogFocused} = useInputFocus();
  
  // Access GitHub context directly instead of through props
  const {getPRStatus, setVisibleWorktrees, refreshPRStatus, refreshPRForWorktree, forceRefreshVisiblePRs} = useGitHubContext();

  // Service instances - stable across re-renders
  const gitService: GitService = useMemo(() => {
    if (gitServiceOverride) return gitServiceOverride;
    return new GitService(getProjectsDirectory());
  }, [gitServiceOverride]);
  const tmuxService: TmuxService = useMemo(() => {
    if (tmuxServiceOverride) return tmuxServiceOverride;
    return new TmuxService();
  }, [tmuxServiceOverride]);
  const memoryMonitorService: MemoryMonitorService = useMemo(() => {
    if (memoryMonitorServiceOverride) return memoryMonitorServiceOverride;
    return new MemoryMonitorService();
  }, [memoryMonitorServiceOverride]);
  const refreshingVisibleRef = React.useRef(false);
  const lastSessionsRef = React.useRef<string[] | null>(null);
  const lastSessionsAtRef = React.useRef<number>(0);
  // Filesystem operations are routed through GitService methods (see CLAUDE.md)

  // Cache available AI tools on startup
  const availableAITools = useMemo(() => detectAvailableAITools(), []);

  const collectWorktrees = useCallback(async (): Promise<Array<{
    project: string; 
    feature: string; 
    path: string; 
    branch: string; 
    mtime?: number
  }>> => {
    const projects = gitService.discoverProjects();
    // Limit concurrent project scans to reduce fs/process load
    const allWorktrees = await mapLimit(projects, 4, async (project) => 
      gitService.getWorktreesForProject(project)
    );
    
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
  }>): Promise<WorktreeInfo[]> => {
    // Get existing worktrees to preserve idle timers and kill flags
    const existingWorktrees = new Map(worktrees.map(w => [`${w.project}/${w.feature}`, w]));
    
    // Get tmux sessions once for all worktrees
    const activeSessions = await tmuxService.listSessions();
    
    // Concurrency-limit git + AI probes across all worktrees
    const results = await mapLimit(list, 6, async (w: any) => {
      try {
        const key = `${w.project}/${w.feature}`;
        const existing = existingWorktrees.get(key);

        // Run git status and claude status in parallel
        const sessionName = tmuxService.sessionName(w.project, w.feature);
        const attached = activeSessions.includes(sessionName);

        const [gitStatus, aiResult] = await Promise.all([
          gitService.getGitStatus(w.path),
          attached ? tmuxService.getAIStatus(sessionName) : Promise.resolve({tool: 'none' as const, status: 'not_running' as const})
        ]);

        const sessionInfo = new SessionInfo({
          session_name: sessionName,
          attached,
          ai_status: aiResult.status,
          ai_tool: aiResult.tool
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
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[attachRuntimeData] worker failed -', err instanceof Error ? err.message : String(err));
        return undefined as any;
      }
    });
    
    return results.filter(Boolean) as WorktreeInfo[];
  }, [gitService, tmuxService, worktrees]);

  const refresh = useCallback(async (refreshPRs: 'all' | 'visible' | 'none' = 'none') => {
    if (loading) {
      logDebug(`[Refresh.Full] Skipped - already loading`);
      return;
    }
    
    const timer = new Timer();
    setLoading(true);
    
    try {
      logDebug(`[Refresh.Full] Starting complete refresh`);
      
      const rawList = await collectWorktrees();
      const enrichedList = await attachRuntimeData(rawList);
      setWorktrees(enrichedList);
      setLastRefreshed(Date.now());

      
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
    
    logDebug(`[Force Refresh] Refreshing ${visibleWorktrees.length} visible PRs on page ${currentPage + 1}`);
    
    try {
      // Force refresh visible PRs by invalidating their cache first
      await forceRefreshVisiblePRs(visibleWorktrees);
      // No need to update worktrees array here; rows read PRs from context
      setLastRefreshed(Date.now());
    } catch (error) {
      console.error('Failed to force refresh visible PRs:', error);
    }
  }, [loading, worktrees, forceRefreshVisiblePRs]);

  const refreshVisibleStatus = useCallback(async (currentPage: number, pageSize: number) => {
    if (worktrees.length === 0) return;

    // Calculate visible worktrees based on pagination
    const startIndex = currentPage * pageSize;
    const endIndex = Math.min(startIndex + pageSize, worktrees.length);
    if (startIndex >= endIndex) return;

    try {
      if (refreshingVisibleRef.current) return;
      refreshingVisibleRef.current = true;
      // Reuse session list if fetched very recently to avoid excessive tmux calls
      let activeSessions: string[];
      const now = Date.now();
      if (lastSessionsRef.current && now - lastSessionsAtRef.current < 1500) {
        activeSessions = lastSessionsRef.current;
      } else {
        activeSessions = await tmuxService.listSessions();
        lastSessionsRef.current = activeSessions;
        lastSessionsAtRef.current = now;
      }
      const indices = Array.from({length: endIndex - startIndex}, (_, k) => startIndex + k);
      if (indices.length > 0) {
        const results = await mapLimit(indices, 3, async (i) => {
          try {
            const wt = worktrees[i];
            const sessionName = tmuxService.sessionName(wt.project, wt.feature);
            const attached = activeSessions.includes(sessionName);
            const [gitStatus, aiResult] = await Promise.all([
              gitService.getGitStatus(wt.path),
              attached ? tmuxService.getAIStatus(sessionName) : Promise.resolve({tool: 'none' as const, status: 'not_running' as const})
            ]);

            // Detect push using same logic as pushed column (is_pushed transition)
            const prevPushed = wt.git?.is_pushed === true;
            const currPushed = gitStatus.is_pushed === true;
            if (!prevPushed && currPushed) {
              const pr = getPRStatus(wt.path);
              if (pr && pr.state === 'OPEN' && refreshPRForWorktree) {
                logDebug(`Detected push for ${wt.feature}, refreshing PR status`);
                await refreshPRForWorktree(wt.path);
              }
            }

            const updated = new WorktreeInfo({
              ...wt,
              git: gitStatus,
              session: new SessionInfo({
                session_name: sessionName,
                attached,
                ai_status: aiResult.status,
                ai_tool: aiResult.tool
              }),
            });
            return {index: i, updated};
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[refreshVisibleStatus] worker failed -', err instanceof Error ? err.message : String(err));
            return undefined as any;
          }
        });
        const merged = [...worktrees];
        for (const r of results) {
          if (!r) continue;
          merged[(r as any).index] = (r as any).updated;
        }
        setWorktrees(merged);
      }
      setLastRefreshed(Date.now());
    } catch (error) {
      console.error('Failed to refresh visible statuses:', error);
    } finally {
      refreshingVisibleRef.current = false;
    }
  }, [worktrees, gitService, tmuxService, getPRStatus, refreshPRForWorktree]);

  const refreshMemoryStatus = useCallback(async () => {
    try {
      const status = await memoryMonitorService.getMemoryStatus();
      setMemoryStatus(status);
    } catch (error) {
      console.error('Failed to refresh memory status:', error);
    }
  }, [memoryMonitorService]);
  
  // Operations
  const createFeature = useCallback(async (projectName: string, featureName: string): Promise<WorktreeInfo | null> => {
    setLoading(true);
    try {
      const created = gitService.createWorktree(projectName, featureName);
      if (!created) return null;

      const worktreePath = path.join(gitService.basePath, `${projectName}${DIR_BRANCHES_SUFFIX}`, featureName);
      
      setupWorktreeEnvironment(projectName, worktreePath);
      
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

      const worktreePath = path.join(gitService.basePath, `${project}${DIR_BRANCHES_SUFFIX}`, localName);
      setupWorktreeEnvironment(project, worktreePath);
      
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
      
      const archivedRoot = path.join(gitService.basePath, `${project}${DIR_ARCHIVED_SUFFIX}`);
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

  // Unarchive and delete archived functionality removed

  const attachSession = useCallback(async (worktree: WorktreeInfo, aiTool?: AITool) => {
    const sessionName = tmuxService.sessionName(worktree.project, worktree.feature);
    const activeSessions = await tmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      // Determine which AI tool to use
      let selectedTool: AITool = aiTool || worktree.session?.ai_tool || 'none';
      
      // If no tool specified and none in session, auto-select based on available tools
      if (selectedTool === 'none') {
        if (availableAITools.length === 1) {
          selectedTool = availableAITools[0];
        } else if (availableAITools.length > 1) {
          // Multiple tools available - this should be handled by UI showing dialog
          // For now, default to the first available tool
          selectedTool = availableAITools[0];
        }
      }
      
      if (selectedTool !== 'none' && availableAITools.includes(selectedTool)) {
        const toolConfig = AI_TOOLS[selectedTool];
        let command: string = toolConfig.command;
        
        // No auto-resume handling; auto-kill feature removed
        
        tmuxService.createSessionWithCommand(sessionName, worktree.path, command, true);
      } else {
        // No AI tool available or selected, create regular bash session
        tmuxService.createSession(sessionName, worktree.path, true);
      }
      
      configureTmuxDisplayTime();
    }
    
    configureTmuxDisplayTime();
    tmuxService.attachSessionInteractive(sessionName);
  }, [tmuxService, availableAITools]);

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
    const projectPath = path.join(gitService.basePath, worktree.project);
    const configPath = path.join(projectPath, RUN_CONFIG_FILE);
    
    // Check if config exists before creating session
    if (!gitService.hasRunConfig(worktree.project)) {
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

  const needsToolSelection = useCallback(async (worktree: WorktreeInfo): Promise<boolean> => {
    const sessionName = tmuxService.sessionName(worktree.project, worktree.feature);
    const activeSessions = await tmuxService.listSessions();
    
    // If session already exists, no need for tool selection
    if (activeSessions.includes(sessionName)) {
      return false;
    }
    
    // If worktree already has a tool selected, no need for selection
    if (worktree.session?.ai_tool && worktree.session.ai_tool !== 'none') {
      return false;
    }
    
    // If only one tool available or no tools, no selection needed
    return availableAITools.length > 1;
  }, [tmuxService, availableAITools]);

  const selectWorktree = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const getSelectedWorktree = useCallback((): WorktreeInfo | null => {
    return worktrees[selectedIndex] || null;
  }, [worktrees, selectedIndex]);

  const getAvailableAITools = useCallback(() => {
    return availableAITools;
  }, [availableAITools]);

  const discoverProjects = useCallback((): ProjectInfo[] => {
    return gitService.discoverProjects();
  }, [gitService]);

  

  const getRemoteBranches = useCallback((project: string): Promise<Array<Record<string, any>>> => {
    return gitService.getRemoteBranches(project);
  }, [gitService]);

  const getRunConfigPath = useCallback((project: string): string => {
    const projectPath = path.join(gitService.basePath, project);
    return path.join(projectPath, RUN_CONFIG_FILE);
  }, []);

  const createOrFillRunConfig = useCallback(async (project: string): Promise<{success: boolean; content?: string; path: string; error?: string}> => {
    const projectPath = path.join(gitService.basePath, project);
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
      gitService.writeRunConfig(project, output);
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
    const projectPath = path.join(gitService.basePath, projectName);
    
    copyEnvironmentFile(projectPath, worktreePath);
    copyClaudeSettings(projectPath, worktreePath);
    copyClaudeDocumentation(projectPath, worktreePath);
  }, []);

  const createTmuxSession = useCallback((project: string, feature: string, cwd: string, command?: string, aiTool?: AITool): string => {
    const sessionName = tmuxService.sessionName(project, feature);
    
    if (command) {
      // Create session with specific command and auto-exit
      tmuxService.createSessionWithCommand(sessionName, cwd, command, true);
    } else {
      // Determine AI tool to use
      let selectedTool: AITool = aiTool || 'none';
      
      // If no tool specified, auto-select based on available tools
      if (selectedTool === 'none') {
        if (availableAITools.length === 1) {
          selectedTool = availableAITools[0];
        } else if (availableAITools.length > 1) {
          // Multiple tools available - default to first one for now
          // In practice, the UI should handle this by showing the dialog
          selectedTool = availableAITools[0];
        }
      }
      
      if (selectedTool !== 'none' && availableAITools.includes(selectedTool)) {
        const toolConfig = AI_TOOLS[selectedTool];
        tmuxService.createSessionWithCommand(sessionName, cwd, toolConfig.command, true);
      } else {
        // No AI tool available, create regular bash session
        tmuxService.createSession(sessionName, cwd, true);
      }
    }
    
    configureTmuxDisplayTime();
    
    return sessionName;
  }, [tmuxService, availableAITools]);

  const createShellSession = useCallback((project: string, feature: string, cwd: string): string => {
    const sessionName = tmuxService.shellSessionName(project, feature);
    const shell = process.env.SHELL || '/bin/bash';
    
    tmuxService.createSessionWithCommand(sessionName, cwd, shell, true);
    configureTmuxDisplayTime();
    
    return sessionName;
  }, [tmuxService]);

  const createRunSession = useCallback((project: string, feature: string, cwd: string): string => {
    const sessionName = tmuxService.runSessionName(project, feature);
    const projectPath = path.join(gitService.basePath, project);
    const configPath = path.join(projectPath, RUN_CONFIG_FILE);
    
    // Create detached session at cwd
    tmuxService.createSession(sessionName, cwd);
    // Auto-destroy session when program exits
    tmuxService.setSessionOption(sessionName, 'remain-on-exit', 'off');
    configureTmuxDisplayTime();
    
    try {
      const configContent = gitService.readRunConfig(project);
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

  const moveWorktreeToArchive = useCallback((worktreePath: string, archivedDest: string, projectName?: string) => {
    gitService.archiveWorktree(projectName || '', worktreePath, archivedDest);
  }, [gitService]);

  const pruneWorktreeReferences = useCallback((projectName: string) => {
    gitService.pruneWorktreeReferences(projectName);
  }, [gitService]);

  const copyEnvironmentFile = useCallback((projectPath: string, worktreePath: string) => {
    const projectName = path.basename(projectPath);
    gitService.copyEnvironmentFile(projectName, worktreePath);
  }, [gitService]);

  const copyClaudeSettings = useCallback((projectPath: string, worktreePath: string) => {
    const projectName = path.basename(projectPath);
    gitService.linkClaudeSettings(projectName, worktreePath);
  }, [gitService]);

  const copyClaudeDocumentation = useCallback((projectPath: string, worktreePath: string) => {
    const projectName = path.basename(projectPath);
    gitService.copyClaudeDocumentation(projectName, worktreePath);
  }, [gitService]);

  const configureTmuxDisplayTime = useCallback(() => {
    tmuxService.setOption('display-time', String(TMUX_DISPLAY_TIME));
  }, [tmuxService]);

  // Auto-refresh intervals
  // Regular cache-based refresh cycle
  useEffect(() => {
    const shouldRefresh = Date.now() - lastRefreshed > CACHE_DURATION;
    if (shouldRefresh) {
      refresh('none').catch(error => {
        console.error('Auto-refresh failed:', error);
      });
    }
  }, [lastRefreshed, refresh]);

  // Initial memory check on mount
  useEffect(() => {
    refreshMemoryStatus().catch(error => {
      console.error('Initial memory status check failed:', error);
    });
  }, [refreshMemoryStatus]);

  // Slow discovery: rebuild worktree list every 60s (or when actions change structure)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isAnyDialogFocused) {
        // Background discovery of worktrees (structure)
        refresh('none').catch(err => console.error('Background discovery failed:', err));
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [refresh, isAnyDialogFocused, tmuxService]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Skip memory status refresh if any dialog is focused to avoid interrupting typing
      if (!isAnyDialogFocused) {
        refreshMemoryStatus().catch(error => {
          console.error('Memory status refresh failed:', error);
        });
      }
    }, MEMORY_REFRESH_DURATION);
    return () => clearInterval(interval);
  }, [refreshMemoryStatus, isAnyDialogFocused]);

  const contextValue: WorktreeContextType = {
    // State
    worktrees,
    loading,
    lastRefreshed,
    selectedIndex,
    memoryStatus,
    
    // Navigation
    selectWorktree,
    getSelectedWorktree,
    
    // Data operations
    refresh,
    refreshVisibleStatus,
    forceRefreshVisible,
    
    // Worktree operations
    createFeature,
    createFromBranch,
    archiveFeature,
    
    // Session operations
    attachSession,
    attachShellSession,
    attachRunSession,
    
    // AI tool management
    getAvailableAITools,
    needsToolSelection,
    
    // Projects
    discoverProjects,
    
    getRemoteBranches,
    
    // Run configuration
    getRunConfigPath,
    createOrFillRunConfig
  };

  return (
    <WorktreeContext.Provider value={contextValue}>
      {children}
    </WorktreeContext.Provider>
  );
}

export function useWorktreeContext(): WorktreeContextType {
  const context = useContext(WorktreeContext);
  if (!context) {
    throw new Error('useWorktreeContext must be used within a WorktreeProvider');
  }
  return context;
}
