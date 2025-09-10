import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {getProjectsDirectory} from '../config.js';
import {GitService} from '../services/GitService.js';
import {TmuxService} from '../services/TmuxService.js';
import type {WorktreeSummary} from './types.js';
import type {AITool, AIStatus} from '../models.js';
import {DIR_BRANCHES_SUFFIX, DIR_ARCHIVED_SUFFIX, ARCHIVE_PREFIX} from '../constants.js';
import {ensureDirectory} from '../shared/utils/fileSystem.js';
import {generateTimestamp} from '../shared/utils/formatting.js';

export interface DevTeamEngineOptions {
  projectsDir?: string;
}

export interface Snapshot {
  version: number;
  items: WorktreeSummary[];
}

export interface DevTeamEngineEvents {
  snapshot: (snap: Snapshot) => void;
  error: (err: unknown) => void;
}

export class DevTeamEngine extends EventEmitter {
  private git: GitService;
  private tmux: TmuxService;
  private version = 0;
  private lastHash: string | null = null;
  private lastItems: WorktreeSummary[] = [];

  constructor(opts: DevTeamEngineOptions = {},
              services?: {git?: GitService; tmux?: TmuxService}) {
    super();
    const projectsDir = opts.projectsDir || getProjectsDirectory();
    this.git = services?.git || new GitService(projectsDir);
    this.tmux = services?.tmux || new TmuxService();
  }

  getSnapshot(): Snapshot {
    return {version: this.version, items: this.lastItems};
  }

  async refreshNow(): Promise<boolean> {
    try {
      const items = await this.buildSnapshot();
      const hash = this.hash(items);
      if (this.lastHash !== hash) {
        this.lastHash = hash;
        this.lastItems = items;
        this.version += 1;
        this.emit('snapshot', this.getSnapshot());
        return true;
      }
      return false;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  private async buildSnapshot(): Promise<WorktreeSummary[]> {
    const projects = this.git.discoverProjects();
    const items: WorktreeSummary[] = [];
    let activeSessions: string[] = [];
    try { activeSessions = await this.tmux.listSessions(); } catch { activeSessions = []; }

    for (const project of projects) {
      try {
        const wts = await this.git.getWorktreesForProject(project);
        for (const wt of wts) {
          const session = this.tmux.sessionName(wt.project, wt.feature);
          const attached = activeSessions.includes(session);
          let ai_tool: AITool | undefined = undefined;
          let ai_status: AIStatus | undefined = undefined;
          if (attached) {
            try {
              const res = await this.tmux.getAIStatus(session);
              ai_tool = res.tool;
              ai_status = res.status;
            } catch {}
          }
          items.push({
            project: wt.project,
            feature: wt.feature,
            path: wt.path,
            branch: wt.branch,
            session,
            attached,
            ai_tool,
            ai_status,
          });
        }
      } catch {}
    }
    items.sort((a, b) => (a.project === b.project) ? a.feature.localeCompare(b.feature) : a.project.localeCompare(b.project));
    return items;
  }

  private hash(items: WorktreeSummary[]): string {
    return createHash('sha1').update(JSON.stringify(items)).digest('hex');
  }

  // ————— Operations (non-terminal + terminal helpers) —————
  getWorktreePath(project: string, feature: string): string {
    return path.join(this.git.basePath, `${project}${DIR_BRANCHES_SUFFIX}`, feature);
  }

  private setupWorktreeEnvironment(project: string, worktreePath: string) {
    try { this.git.copyEnvironmentFile(project, worktreePath); } catch {}
    try { this.git.linkClaudeSettings(project, worktreePath); } catch {}
  }

  async createFeature(project: string, featureName: string): Promise<boolean> {
    const ok = this.git.createWorktree(project, featureName);
    if (!ok) return false;
    const wtPath = this.getWorktreePath(project, featureName);
    this.setupWorktreeEnvironment(project, wtPath);
    await this.refreshNow();
    return true;
  }

  async createFromBranch(project: string, remoteBranch: string, localName: string): Promise<boolean> {
    const ok = this.git.createWorktreeFromRemote(project, remoteBranch, localName);
    if (!ok) return false;
    const wtPath = this.getWorktreePath(project, localName);
    this.setupWorktreeEnvironment(project, wtPath);
    await this.refreshNow();
    return true;
  }

  async terminateFeatureSessions(project: string, feature: string): Promise<void> {
    const names = [
      this.tmux.sessionName(project, feature),
      this.tmux.shellSessionName(project, feature),
      this.tmux.runSessionName(project, feature)
    ];
    try {
      const active = await this.tmux.listSessions();
      for (const s of names) if (active.includes(s)) this.tmux.killSession(s);
    } catch {}
  }

  async archiveFeature(project: string, worktreePath: string, feature: string): Promise<{archivedPath: string}> {
    try {
      await this.terminateFeatureSessions(project, feature);
    } catch {}
    const archivedRoot = path.join(this.git.basePath, `${project}${DIR_ARCHIVED_SUFFIX}`);
    ensureDirectory(archivedRoot);
    const timestamp = generateTimestamp();
    const archivedDest = path.join(archivedRoot, `${ARCHIVE_PREFIX}${timestamp}_${feature}`);
    this.git.archiveWorktree(project, worktreePath, archivedDest);
    this.git.pruneWorktreeReferences(project);
    await this.refreshNow();
    return {archivedPath: archivedDest};
  }

  async getRemoteBranches(project: string): Promise<Array<Record<string, any>>> {
    return this.git.getRemoteBranches(project);
  }
}
