import path from 'node:path';
import fs from 'node:fs';
import {
  BASE_PATH,
  DIR_BRANCHES_SUFFIX,
  DIR_ARCHIVED_SUFFIX,
  ARCHIVE_PREFIX,
  ENV_FILE,
  CLAUDE_SETTINGS_FILE,
  RUN_CONFIG_FILE,
} from './constants.js';
import {ensureDirectory, runCommand, runCommandQuick, commandExitCode, runCommandAsync, runClaudeSync, copyWithIgnore, generateTimestamp, runInteractive} from './utils.js';
import {TMUX_DISPLAY_TIME} from './constants.js';
import {TmuxManager} from './tmuxManager.js';
import {GitManager} from './gitManager.js';

const tm = new TmuxManager();
const gm = new GitManager();

export function attachOrCreateSession(project: string, feature: string, cwd: string) {
  const session = tm.sessionName(project, feature);
  if (!tm.listSessions().includes(session)) {
    createTmuxSession(project, feature, cwd);
  }
  // Ensure short/no display-time for existing sessions too
  runCommand(['tmux', 'set-option', '-g', 'display-time', String(TMUX_DISPLAY_TIME)]);
  // Attach takes over terminal; spawn synchronously
  runInteractive('tmux', ['attach-session', '-t', session]);
}

export function createTmuxSession(project: string, feature: string, cwd: string) {
  const session = tm.sessionName(project, feature);
  // Create detached session at cwd
  runCommand(['tmux', 'new-session', '-ds', session, '-c', cwd]);
  // Suppress status message display entirely if supported
  runCommand(['tmux', 'set-option', '-g', 'display-time', String(TMUX_DISPLAY_TIME)]);
  // Try to start Claude in pane 0
  const hasClaude = !!runCommandQuick(['bash', '-lc', 'command -v claude || true']);
  if (hasClaude) {
    runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, 'claude', 'C-m']);
  }
  return session;
}

export function attachOrCreateShellSession(project: string, feature: string, cwd: string) {
  const session = `${tm.sessionName(project, feature)}-shell`;
  if (!tm.listSessions().includes(session)) {
    createShellSession(project, feature, cwd);
  }
  runCommand(['tmux', 'set-option', '-g', 'display-time', String(TMUX_DISPLAY_TIME)]);
  runInteractive('tmux', ['attach-session', '-t', session]);
}

export function createShellSession(project: string, feature: string, cwd: string) {
  const session = `${tm.sessionName(project, feature)}-shell`;
  const shell = process.env.SHELL || '/bin/bash';
  runCommand(['tmux', 'new-session', '-ds', session, '-c', cwd, shell]);
  runCommand(['tmux', 'set-option', '-g', 'display-time', String(TMUX_DISPLAY_TIME)]);
  return session;
}

export function attachOrCreateRunSession(project: string, feature: string, cwd: string): 'success' | 'no_config' {
  const projectPath = path.join(BASE_PATH, project);
  const configPath = path.join(projectPath, RUN_CONFIG_FILE);
  
  // Check if config exists before creating session
  if (!fs.existsSync(configPath)) {
    return 'no_config';
  }

  const session = tm.runSessionName(project, feature);
  if (!tm.listSessions().includes(session)) {
    createRunSession(project, feature, cwd);
  }
  runCommand(['tmux', 'set-option', '-g', 'display-time', String(TMUX_DISPLAY_TIME)]);
  runInteractive('tmux', ['attach-session', '-t', session]);
  return 'success';
}

export function createRunSession(project: string, feature: string, cwd: string) {
  const session = tm.runSessionName(project, feature);
  const projectPath = path.join(BASE_PATH, project);
  const configPath = path.join(projectPath, RUN_CONFIG_FILE);
  
  // Create detached session at cwd
  runCommand(['tmux', 'new-session', '-ds', session, '-c', cwd]);
  runCommand(['tmux', 'set-option', '-g', 'display-time', String(TMUX_DISPLAY_TIME)]);
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // Run setup commands if they exist
    if (config.setup && Array.isArray(config.setup)) {
      for (const setupCmd of config.setup) {
        runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, setupCmd, 'C-m']);
      }
    }
    
    // Set environment variables if they exist
    if (config.env && typeof config.env === 'object') {
      for (const [key, value] of Object.entries(config.env)) {
        runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, `export ${key}="${value}"`, 'C-m']);
      }
    }
    
    // Run the main command
    if (config.command) {
      if (config.watch === false) {
        // For non-watch commands (builds, tests), let session exit when command finishes
        runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, config.command, 'C-m']);
      } else {
        // For watch commands (servers, dev), keep session alive after command exits
        runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, `${config.command}; exec bash`, 'C-m']);
      }
    }
  } catch (error) {
    // Config file exists but is invalid, show error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    runCommand(['tmux', 'send-keys', '-t', `${session}:0.0`, `echo "Invalid run config at ${configPath}: ${errorMessage}"`, 'C-m']);
  }
  
  return session;
}

export type ConfigResult = {
  success: boolean;
  content?: string;
  path: string;
  error?: string;
};

export const RUN_CONFIG_CLAUDE_PROMPT = `Analyze this project directory and generate a run-session.config.json file.

CRITICAL: Your response must be ONLY the JSON object. Do NOT use markdown code blocks or any formatting.

Example of what to output:
{"command": "npm start", "env": {}, "setup": [], "watch": true}

Fill in values based on the project files you see:
- "command": main run command (e.g. "npm run dev", "python app.py")
- "env": object with environment variables (usually empty {})
- "setup": array of setup commands (e.g. ["npm install"])
- "watch": true for servers/long-running, false for build/test commands

Your response must start with { and end with } - nothing else.`;

export function getRunConfigPath(project: string): string {
  const projectPath = path.join(BASE_PATH, project);
  return path.join(projectPath, RUN_CONFIG_FILE);
}

export function createOrFillRunConfig(project: string): ConfigResult {
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

export function createFeature(projectName: string, featureName: string) {
  const projectPath = path.join(BASE_PATH, projectName);
  const created = gm.createWorktree(projectName, featureName);
  const branchesDir = path.join(BASE_PATH, `${projectName}${DIR_BRANCHES_SUFFIX}`);
  const worktreePath = path.join(branchesDir, featureName);
  if (!created) return null;
  // Setup environment files
  const envSrc = path.join(projectPath, ENV_FILE);
  const envDst = path.join(worktreePath, ENV_FILE);
  if (fs.existsSync(envSrc)) {
    ensureDirectory(path.dirname(envDst));
    fs.copyFileSync(envSrc, envDst);
  }
  const claudeSrc = path.join(projectPath, CLAUDE_SETTINGS_FILE);
  const claudeDst = path.join(worktreePath, CLAUDE_SETTINGS_FILE);
  if (fs.existsSync(claudeSrc)) {
    ensureDirectory(path.dirname(claudeDst));
    fs.copyFileSync(claudeSrc, claudeDst);
  }
  // Copy common Claude config files if present
  const claudeDoc = path.join(projectPath, 'CLAUDE.md');
  if (fs.existsSync(claudeDoc)) fs.copyFileSync(claudeDoc, path.join(worktreePath, 'CLAUDE.md'));
  // Create tmux session (detached)
  createTmuxSession(projectName, featureName, worktreePath);
  return {project: projectName, feature: featureName, path: worktreePath, branch: `feature/${featureName}`};
}

export function setupWorktreeEnvironment(projectName: string, worktreePath: string) {
  const projectPath = path.join(BASE_PATH, projectName);
  const envSrc = path.join(projectPath, ENV_FILE);
  const envDst = path.join(worktreePath, ENV_FILE);
  if (fs.existsSync(envSrc)) {
    ensureDirectory(path.dirname(envDst));
    fs.copyFileSync(envSrc, envDst);
  }
  const claudeSrc = path.join(projectPath, CLAUDE_SETTINGS_FILE);
  const claudeDst = path.join(worktreePath, CLAUDE_SETTINGS_FILE);
  if (fs.existsSync(claudeSrc)) {
    ensureDirectory(path.dirname(claudeDst));
    fs.copyFileSync(claudeSrc, claudeDst);
  }
  const claudeDoc = path.join(projectPath, 'CLAUDE.md');
  if (fs.existsSync(claudeDoc)) fs.copyFileSync(claudeDoc, path.join(worktreePath, 'CLAUDE.md'));
}


export function archiveFeature(projectName: string, worktreePath: string, featureName: string) {
  // Kill tmux session if running
  const session = tm.sessionName(projectName, featureName);
  if (tm.listSessions().includes(session)) {
    runCommand(['tmux', 'kill-session', '-t', session]);
  }

  // Move directory to archived folder with timestamp
  const archivedRoot = path.join(BASE_PATH, `${projectName}${DIR_ARCHIVED_SUFFIX}`);
  ensureDirectory(archivedRoot);
  const ts = generateTimestamp();
  const archivedDest = path.join(archivedRoot, `${ARCHIVE_PREFIX}${ts}_${featureName}`);

  try {
    fs.renameSync(worktreePath, archivedDest);
  } catch (e) {
    // Fallback: copy then remove
    copyWithIgnore(worktreePath, archivedDest);
    fs.rmSync(worktreePath, {recursive: true, force: true});
  }

  // Prune stale worktree refs
  const projectPath = path.join(BASE_PATH, projectName);
  runCommand(['git', '-C', projectPath, 'worktree', 'prune']);

  return {archivedPath: archivedDest};
}

export function getPRStatus(worktreePath: string) {
  // Requires GitHub CLI installed and authenticated
  const out = runCommandQuick(['bash', '-lc', `cd ${JSON.stringify(worktreePath)} && gh pr view --json state,url,mergeStateStatus,headRefName 2>/dev/null || true`]);
  if (!out) return null;
  try {
    const data = JSON.parse(out);
    return {
      state: data.state || 'none',
      url: data.url || null,
      ci_status: data.mergeStateStatus || 'unknown',
      head: data.headRefName || null,
    };
  } catch {
    return null;
  }
}

export function deleteArchived(pathToArchived: string): boolean {
  try {
    fs.rmSync(pathToArchived, {recursive: true, force: true});
    return true;
  } catch {
    return false;
  }
}
