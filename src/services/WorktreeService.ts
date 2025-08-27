import path from 'node:path';
import fs from 'node:fs';
import {
  BASE_PATH,
  DIR_BRANCHES_SUFFIX,
  DIR_ARCHIVED_SUFFIX,
  ARCHIVE_PREFIX,
  ENV_FILE,
  CLAUDE_SETTINGS_FILE,
  TMUX_DISPLAY_TIME,
  RUN_CONFIG_FILE,
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
import {GitService} from './GitService.js';
import {TmuxService} from './TmuxService.js';

export type WorktreeCreationResult = {
  project: string;
  feature: string;
  path: string;
  branch: string;
} | null;

export type ArchiveResult = {
  archivedPath: string;
};


export type ConfigResult = {
  success: boolean;
  content?: string;
  path: string;
  error?: string;
};

export class WorktreeService {
  private gitService: GitService;
  private tmuxService: TmuxService;

  constructor(gitService?: GitService, tmuxService?: TmuxService) {
    this.gitService = gitService || new GitService();
    this.tmuxService = tmuxService || new TmuxService();
  }

  createFeature(projectName: string, featureName: string): WorktreeCreationResult {
    const created = this.gitService.createWorktree(projectName, featureName);
    if (!created) return null;

    const worktreePath = path.join(BASE_PATH, `${projectName}${DIR_BRANCHES_SUFFIX}`, featureName);
    
    this.setupWorktreeEnvironment(projectName, worktreePath);
    this.createTmuxSession(projectName, featureName, worktreePath);
    
    return {
      project: projectName,
      feature: featureName,
      path: worktreePath,
      branch: `feature/${featureName}`
    };
  }

  createWorktreeFromRemoteBranch(project: string, remoteBranch: string, localName: string): boolean {
    const created = this.gitService.createWorktreeFromRemote(project, remoteBranch, localName);
    if (!created) return false;

    const worktreePath = path.join(BASE_PATH, `${project}${DIR_BRANCHES_SUFFIX}`, localName);
    this.setupWorktreeEnvironment(project, worktreePath);
    this.createTmuxSession(project, localName, worktreePath);
    
    return true;
  }

  archiveFeature(projectName: string, worktreePath: string, featureName: string): ArchiveResult {
    this.terminateFeatureSessions(projectName, featureName);
    
    const archivedRoot = path.join(BASE_PATH, `${projectName}${DIR_ARCHIVED_SUFFIX}`);
    ensureDirectory(archivedRoot);
    
    const timestamp = generateTimestamp();
    const archivedDest = path.join(archivedRoot, `${ARCHIVE_PREFIX}${timestamp}_${featureName}`);

    this.moveWorktreeToArchive(worktreePath, archivedDest);
    this.pruneWorktreeReferences(projectName);

    return {archivedPath: archivedDest};
  }

  deleteArchived(pathToArchived: string): boolean {
    try {
      fs.rmSync(pathToArchived, {recursive: true, force: true});
      return true;
    } catch {
      return false;
    }
  }

  attachOrCreateSession(project: string, feature: string, cwd: string): void {
    const sessionName = this.tmuxService.sessionName(project, feature);
    const activeSessions = this.tmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      this.createTmuxSession(project, feature, cwd);
    }
    
    this.configureTmuxDisplayTime();
    runInteractive('tmux', ['attach-session', '-t', sessionName]);
  }

  attachOrCreateShellSession(project: string, feature: string, cwd: string): void {
    const sessionName = this.tmuxService.shellSessionName(project, feature);
    const activeSessions = this.tmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      this.createShellSession(project, feature, cwd);
    }
    
    this.configureTmuxDisplayTime();
    runInteractive('tmux', ['attach-session', '-t', sessionName]);
  }

  setupWorktreeEnvironment(projectName: string, worktreePath: string): void {
    const projectPath = path.join(BASE_PATH, projectName);
    
    this.copyEnvironmentFile(projectPath, worktreePath);
    this.copyClaudeSettings(projectPath, worktreePath);
    this.copyClaudeDocumentation(projectPath, worktreePath);
  }

  createTmuxSession(project: string, feature: string, cwd: string): string {
    const sessionName = this.tmuxService.sessionName(project, feature);
    
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd]);
    this.configureTmuxDisplayTime();
    this.startClaudeIfAvailable(sessionName);
    
    return sessionName;
  }

  createShellSession(project: string, feature: string, cwd: string): string {
    const sessionName = this.tmuxService.shellSessionName(project, feature);
    const shell = process.env.SHELL || '/bin/bash';
    
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd, shell]);
    this.configureTmuxDisplayTime();
    
    return sessionName;
  }

  attachOrCreateRunSession(project: string, feature: string, cwd: string): 'success' | 'no_config' {
    const projectPath = path.join(BASE_PATH, project);
    const configPath = path.join(projectPath, RUN_CONFIG_FILE);
    
    // Check if config exists before creating session
    if (!fs.existsSync(configPath)) {
      return 'no_config';
    }

    const sessionName = this.tmuxService.runSessionName(project, feature);
    const activeSessions = this.tmuxService.listSessions();
    
    if (!activeSessions.includes(sessionName)) {
      this.createRunSession(project, feature, cwd);
    }
    
    this.configureTmuxDisplayTime();
    runInteractive('tmux', ['attach-session', '-t', sessionName]);
    return 'success';
  }

  createRunSession(project: string, feature: string, cwd: string): string {
    const sessionName = this.tmuxService.runSessionName(project, feature);
    const projectPath = path.join(BASE_PATH, project);
    const configPath = path.join(projectPath, RUN_CONFIG_FILE);
    
    // Create detached session at cwd
    runCommand(['tmux', 'new-session', '-ds', sessionName, '-c', cwd]);
    this.configureTmuxDisplayTime();
    
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
  }

  getRunConfigPath(project: string): string {
    const projectPath = path.join(BASE_PATH, project);
    return path.join(projectPath, RUN_CONFIG_FILE);
  }

  createOrFillRunConfig(project: string): ConfigResult {
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
    
    const prompt = `Analyze this project directory and generate a run-session.config.json file.

CRITICAL: Your response must be ONLY the JSON object. Do NOT use markdown code blocks or any formatting.

Example of what to output:
{"command": "npm start", "env": {}, "setup": [], "watch": true}

Fill in values based on the project files you see:
- "command": main run command (e.g. "npm run dev", "python app.py")
- "env": object with environment variables (usually empty {})
- "setup": array of setup commands (e.g. ["npm install"])
- "watch": true for servers/long-running, false for build/test commands

Your response must start with { and end with } - nothing else.`;
    
    // Use Claude to generate the config
    const claudeResult = runClaudeSync(prompt, projectPath);
    
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
    output = output.replace(/^```json\s*\n?/, '').replace(/\n?```$/, '').trim();
    
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
  }

  // Private helper methods
  private terminateFeatureSessions(projectName: string, featureName: string): void {
    const sessionName = this.tmuxService.sessionName(projectName, featureName);
    const activeSessions = this.tmuxService.listSessions();
    
    if (activeSessions.includes(sessionName)) {
      runCommand(['tmux', 'kill-session', '-t', sessionName]);
    }
  }

  private moveWorktreeToArchive(worktreePath: string, archivedDest: string): void {
    try {
      fs.renameSync(worktreePath, archivedDest);
    } catch {
      // Fallback: copy then remove
      copyWithIgnore(worktreePath, archivedDest);
      fs.rmSync(worktreePath, {recursive: true, force: true});
    }
  }

  private pruneWorktreeReferences(projectName: string): void {
    const projectPath = path.join(BASE_PATH, projectName);
    runCommand(['git', '-C', projectPath, 'worktree', 'prune']);
  }

  private copyEnvironmentFile(projectPath: string, worktreePath: string): void {
    const envSrc = path.join(projectPath, ENV_FILE);
    const envDst = path.join(worktreePath, ENV_FILE);
    
    if (fs.existsSync(envSrc)) {
      ensureDirectory(path.dirname(envDst));
      fs.copyFileSync(envSrc, envDst);
    }
  }

  private copyClaudeSettings(projectPath: string, worktreePath: string): void {
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
  }

  private copyClaudeDocumentation(projectPath: string, worktreePath: string): void {
    const claudeDoc = path.join(projectPath, 'CLAUDE.md');
    const claudeDestDoc = path.join(worktreePath, 'CLAUDE.md');
    
    if (fs.existsSync(claudeDoc)) {
      fs.copyFileSync(claudeDoc, claudeDestDoc);
    }
  }

  private configureTmuxDisplayTime(): void {
    runCommand(['tmux', 'set-option', '-g', 'display-time', String(TMUX_DISPLAY_TIME)]);
  }

  private startClaudeIfAvailable(sessionName: string): void {
    const hasClaude = !!runCommandQuick(['bash', '-lc', 'command -v claude || true']);
    if (hasClaude) {
      runCommand(['tmux', 'send-keys', '-t', `${sessionName}:0.0`, 'claude', 'C-m']);
    }
  }

}