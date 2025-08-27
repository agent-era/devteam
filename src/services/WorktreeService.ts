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
} from '../constants.js';
import {
  ensureDirectory, 
  runCommand, 
  runCommandQuick, 
  copyWithIgnore, 
  generateTimestamp, 
  runInteractive
} from '../utils.js';
import {GitService} from './GitService.js';
import {TmuxService} from './TmuxService.js';
import {
  checkSettingsMergeOpportunity,
  parseClaudeSettings,
  mergePermissions,
  writeClaudeSettings,
  type ClaudeSettings
} from '../claudeSettingsManager.js';

export type WorktreeCreationResult = {
  project: string;
  feature: string;
  path: string;
  branch: string;
} | null;

export type ArchiveResult = {
  archivedPath: string;
};

export type SettingsMergeInfo = {
  canMerge: boolean;
  scenario: 'no_worktree_settings' | 'copy_to_main' | 'merge_permissions';
  newPermissions: string[];
  worktreeSettingsPath: string | null;
  mainSettingsPath: string | null;
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
    const claudeSrc = path.join(projectPath, CLAUDE_SETTINGS_FILE);
    const claudeDst = path.join(worktreePath, CLAUDE_SETTINGS_FILE);
    
    if (fs.existsSync(claudeSrc)) {
      ensureDirectory(path.dirname(claudeDst));
      fs.copyFileSync(claudeSrc, claudeDst);
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

  // Claude Settings Management
  checkClaudeSettingsMerge(projectName: string, worktreePath: string, featureName: string): SettingsMergeInfo {
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

  performClaudeSettingsMerge(projectName: string, worktreePath: string): boolean {
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
}