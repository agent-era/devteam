import path from 'node:path';
import fs from 'node:fs';
import {
  BASE_PATH,
  DIR_BRANCHES_SUFFIX,
  DIR_ARCHIVED_SUFFIX,
  ARCHIVE_PREFIX,
  ENV_FILE,
  CLAUDE_SETTINGS_FILE,
} from './constants.js';
import {ensureDirectory, runCommand, runCommandQuick, copyWithIgnore, generateTimestamp, runInteractive} from './utils.js';
import {TMUX_DISPLAY_TIME} from './constants.js';
import {TmuxManager} from './tmuxManager.js';
import {GitManager} from './gitManager.js';
import {checkSettingsMergeOpportunity, parseClaudeSettings, mergePermissions, writeClaudeSettings, type ClaudeSettings} from './claudeSettingsManager.js';
// constants already imported above; remove duplicate import

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

export interface SettingsMergeInfo {
  canMerge: boolean;
  scenario: 'no_worktree_settings' | 'copy_to_main' | 'merge_permissions';
  newPermissions: string[];
  worktreeSettingsPath: string | null;
  mainSettingsPath: string | null;
}

export interface ActiveSettingsMergeInfo {
  canMerge: true;
  scenario: 'copy_to_main' | 'merge_permissions';
  newPermissions: string[];
  worktreeSettingsPath: string;
  mainSettingsPath: string;
}

export function checkClaudeSettingsMerge(projectName: string, worktreePath: string, featureName: string): SettingsMergeInfo {
  const projectPath = path.join(BASE_PATH, projectName);
  const opportunity = checkSettingsMergeOpportunity(worktreePath, projectPath);
  
  let newPermissions: string[] = [];
  
  if (opportunity.canMerge && opportunity.worktreeSettingsPath) {
    const worktreeSettings = parseClaudeSettings(opportunity.worktreeSettingsPath);
    
    if (worktreeSettings) {
      if (opportunity.scenario === 'copy_to_main') {
        // All permissions from worktree are "new" since main has no settings
        newPermissions = worktreeSettings.permissions.allow;
      } else if (opportunity.scenario === 'merge_permissions' && opportunity.mainSettingsPath) {
        // Find permissions that would be added
        const mainSettings = parseClaudeSettings(opportunity.mainSettingsPath);
        if (mainSettings) {
          const mergeResult = mergePermissions(worktreeSettings, mainSettings);
          newPermissions = mergeResult.newPermissions;
        }
      }
    }
  }
  
  return {
    canMerge: opportunity.canMerge && newPermissions.length > 0,
    scenario: opportunity.scenario,
    newPermissions,
    worktreeSettingsPath: opportunity.worktreeSettingsPath,
    mainSettingsPath: opportunity.mainSettingsPath,
  };
}

export function performClaudeSettingsMerge(projectName: string, worktreePath: string): boolean {
  const projectPath = path.join(BASE_PATH, projectName);
  const opportunity = checkSettingsMergeOpportunity(worktreePath, projectPath);
  
  if (!opportunity.canMerge || !opportunity.worktreeSettingsPath) {
    return false;
  }
  
  const worktreeSettings = parseClaudeSettings(opportunity.worktreeSettingsPath);
  if (!worktreeSettings) {
    return false;
  }
  
  if (opportunity.scenario === 'copy_to_main') {
    // Copy entire settings file to main project
    return writeClaudeSettings(opportunity.mainSettingsPath!, worktreeSettings);
  } else if (opportunity.scenario === 'merge_permissions' && opportunity.mainSettingsPath) {
    // Merge permissions into existing main settings
    const mainSettings = parseClaudeSettings(opportunity.mainSettingsPath);
    if (!mainSettings) {
      return false;
    }
    
    const mergeResult = mergePermissions(worktreeSettings, mainSettings);
    if (mergeResult.hasChanges) {
      return writeClaudeSettings(opportunity.mainSettingsPath, mergeResult.mergedSettings);
    }
  }
  
  return false;
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
