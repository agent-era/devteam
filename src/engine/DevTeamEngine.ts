import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {getProjectsDirectory} from '../config.js';
import {GitService} from '../services/GitService.js';
import {TmuxService} from '../services/TmuxService.js';
import {WorkspaceService} from '../services/WorkspaceService.js';
import {mapLimit} from '../shared/utils/concurrency.js';
import {computeStatusLabel} from './status.js';
import {GitHubEngine} from './GitHubEngine.js';
import type {WorktreeSummary} from '../sync/types.js';
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
  private workspace: WorkspaceService;
  private gh: GitHubEngine;
  private version = 0;
  private lastHash: string | null = null;
  private lastItems: WorktreeSummary[] = [];
  private gitCache: Map<string, {has_changes: boolean; base_added_lines: number; base_deleted_lines: number; ahead: number; behind: number}> = new Map();
  private lastGitRefreshAt = 0;
  private gitRefreshIntervalMs = Math.max(2000, Number(process.env.GIT_REFRESH_INTERVAL_MS || 15000));

  constructor(opts: DevTeamEngineOptions = {},
              services?: {git?: GitService; tmux?: TmuxService}) {
    super();
    const projectsDir = opts.projectsDir || getProjectsDirectory();
    this.git = services?.git || new GitService(projectsDir);
    this.tmux = services?.tmux || new TmuxService();
    this.workspace = new WorkspaceService();
    this.gh = new GitHubEngine();
  }

  getSnapshot(): Snapshot {
    return {version: this.version, items: this.lastItems};
  }

  getPRMap(): Record<string, import('../models.js').PRStatus> {
    try {
      return this.gh.getMap();
    } catch {
      return {} as any;
    }
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

  // Progressive refresh: emit snapshot immediately using current caches,
  // then after git cache refresh, then after PR refresh.
  async refreshProgressive(): Promise<void> {
    let activeSessions: string[] = [];
    try { activeSessions = await this.tmux.listSessions(); } catch { activeSessions = []; }
    const collected = await this.collectWorktrees(activeSessions);
    {
      const items = await this.buildSnapshotFromCollected(collected, activeSessions);
      await this.emitIfChanged(items);
    }
    await this.refreshGitCache(collected);
    {
      const items = await this.buildSnapshotFromCollected(collected, activeSessions);
      await this.emitIfChanged(items);
    }
    try {
      const wts = collected.map(it => ({project: it.project, path: it.path, is_archived: false as const}));
      await this.gh.refresh(wts, true);
    } catch {}
    {
      const items = await this.buildSnapshotFromCollected(collected, activeSessions);
      await this.emitIfChanged(items);
    }
  }

  private async emitIfChanged(items: WorktreeSummary[]): Promise<void> {
    const hash = this.hash(items);
    if (this.lastHash !== hash) {
      this.lastHash = hash;
      this.lastItems = items;
      this.version += 1;
      this.emit('snapshot', this.getSnapshot());
    }
  }

  private async collectWorktrees(activeSessions: string[]): Promise<WorktreeSummary[]> {
    const projects = this.git.discoverProjects();
    const collected: WorktreeSummary[] = [];
    for (const project of projects) {
      try {
        const wts = await this.git.getWorktreesForProject(project);
        for (const wt of wts) {
          const session = this.tmux.sessionName(wt.project, wt.feature);
          const attached = activeSessions.includes(session);
          let ai_tool: AITool | undefined = 'none';
          let ai_status: AIStatus | undefined = 'not_running';
          if (attached) {
            try {
              const res = await this.tmux.getAIStatus(session);
              ai_tool = res.tool;
              ai_status = res.status;
            } catch {}
          }
          collected.push({
            project: wt.project,
            feature: wt.feature,
            path: wt.path,
            branch: wt.branch,
            session,
            attached,
            ai_tool,
            ai_status,
            last_commit_ts: wt.last_commit_ts || 0,
          });
        }
      } catch {}
    }
    return collected;
  }

  private async buildSnapshotFromCollected(collected: WorktreeSummary[], activeSessions: string[]): Promise<WorktreeSummary[]> {
    // Group by feature across projects
    const byFeature = new Map<string, WorktreeSummary[]>();
    for (const it of collected) {
      const list = byFeature.get(it.feature) || [];
      list.push(it);
      byFeature.set(it.feature, list);
    }

    // Order features by most recent commit among children
    const ordered = [...byFeature.entries()].sort((a, b) => {
      const maxA = Math.max(...a[1].map(x => x.last_commit_ts || 0), 0);
      const maxB = Math.max(...b[1].map(x => x.last_commit_ts || 0), 0);
      return maxB - maxA;
    });

    const base = this.git.basePath;
    const final: WorktreeSummary[] = [];
    for (const [feature, children] of ordered) {
      const hasWS = this.workspace.hasWorkspaceForFeature(base, feature);
      if (!hasWS) {
        for (const c of children) {
          const key = `${c.project}/${c.feature}`;
          const git = this.gitCache.get(key);
          const pr = this.gh.get(c.path);
          final.push({
            ...c,
            has_changes: git?.has_changes,
            base_added_lines: git?.base_added_lines,
            base_deleted_lines: git?.base_deleted_lines,
            ahead: git?.ahead,
            behind: git?.behind,
            status_label: computeStatusLabel({
              ai_status: c.ai_status,
              attached: c.attached,
              has_changes: git?.has_changes,
              ahead: git?.ahead,
              behind: git?.behind,
              pr: pr || undefined,
            } as any),
          });
        }
        continue;
      }
      // Workspace exists: create header and mark children
      const wsPath = path.join(base, 'workspaces', feature);
      const wsSession = this.tmux.sessionName('workspace', feature);
      const wsAttached = activeSessions.includes(wsSession);
      let wsTool: AITool | undefined = 'none';
      let wsStatus: AIStatus | undefined = 'not_running';
      if (wsAttached) {
        try {
          const res = await this.tmux.getAIStatus(wsSession);
          wsTool = res.tool;
          wsStatus = res.status;
        } catch {}
      }
      const header: WorktreeSummary = {
        project: 'workspace',
        feature,
        path: wsPath,
        branch: feature,
        session: wsSession,
        attached: wsAttached,
        ai_tool: wsTool,
        ai_status: wsStatus,
        is_workspace: true,
        is_workspace_header: true,
        status_label: computeStatusLabel({ai_status: wsStatus, attached: wsAttached}),
      };
      final.push(header);
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        const key = `${c.project}/${c.feature}`;
        const git = this.gitCache.get(key);
        const pr = this.gh.get(c.path);
        final.push({
          ...c,
          is_workspace: true,
          is_workspace_child: true,
          parent_feature: feature,
          has_changes: git?.has_changes,
          base_added_lines: git?.base_added_lines,
          base_deleted_lines: git?.base_deleted_lines,
          ahead: git?.ahead,
          behind: git?.behind,
          status_label: computeStatusLabel({
            ai_status: c.ai_status,
            attached: c.attached,
            has_changes: git?.has_changes,
            ahead: git?.ahead,
            behind: git?.behind,
            pr: pr || undefined,
          } as any),
        });
      }
    }
    // Enrich standalone rows (non-workspace)
    for (let i = 0; i < final.length; i++) {
      const it = final[i];
      if (it.is_workspace_header || it.is_workspace_child) continue;
      const key = `${it.project}/${it.feature}`;
      const git = this.gitCache.get(key);
      const pr = this.gh.get(it.path);
      final[i] = {
        ...it,
        has_changes: git?.has_changes,
        base_added_lines: git?.base_added_lines,
        base_deleted_lines: git?.base_deleted_lines,
        ahead: git?.ahead,
        behind: git?.behind,
        status_label: computeStatusLabel({
          ai_status: it.ai_status,
          attached: it.attached,
          has_changes: git?.has_changes,
          ahead: git?.ahead,
          behind: git?.behind,
          pr: pr || undefined,
        } as any),
      };
    }
    return final;
  }

  private async refreshGitCache(targets: WorktreeSummary[]): Promise<void> {
    const results = await Promise.all(targets.map(async (it) => {
      try {
        const st = await this.git.getGitStatus(it.path);
        return { key: `${it.project}/${it.feature}`, value: {
          has_changes: !!st.has_changes,
          base_added_lines: st.base_added_lines || 0,
          base_deleted_lines: st.base_deleted_lines || 0,
          ahead: st.ahead || 0,
          behind: st.behind || 0,
        }};
      } catch {
        return null;
      }
    }));
    for (const r of results) {
      if (!r) continue;
      this.gitCache.set(r.key, r.value);
    }
    this.lastGitRefreshAt = Date.now();
  }
  private async buildSnapshot(): Promise<WorktreeSummary[]> {
    const projects = this.git.discoverProjects();
    let activeSessions: string[] = [];
    try { activeSessions = await this.tmux.listSessions(); } catch { activeSessions = []; }

    // Collect all worktrees across projects with runtime AI info
    const collected: WorktreeSummary[] = [];
    for (const project of projects) {
      try {
        const wts = await this.git.getWorktreesForProject(project);
        for (const wt of wts) {
          const session = this.tmux.sessionName(wt.project, wt.feature);
          const attached = activeSessions.includes(session);
          let ai_tool: AITool | undefined = 'none';
          let ai_status: AIStatus | undefined = 'not_running';
          if (attached) {
            try {
              const res = await this.tmux.getAIStatus(session);
              ai_tool = res.tool;
              ai_status = res.status;
            } catch {}
          }
          collected.push({
            project: wt.project,
            feature: wt.feature,
            path: wt.path,
            branch: wt.branch,
            session,
            attached,
            ai_tool,
            ai_status,
            last_commit_ts: wt.last_commit_ts || 0,
          });
        }
      } catch {}
    }

    // Lightweight cache refresh for git + PRs
    const now = Date.now();
    if (now - this.lastGitRefreshAt >= this.gitRefreshIntervalMs) {
      const targets = collected.filter(it => !(it as any).is_workspace_header);
      const results = await mapLimit(targets, 4, async (it) => {
        try {
          const st = await this.git.getGitStatus(it.path);
          return { key: `${it.project}/${it.feature}`, value: {
            has_changes: !!st.has_changes,
            base_added_lines: st.base_added_lines || 0,
            base_deleted_lines: st.base_deleted_lines || 0,
            ahead: st.ahead || 0,
            behind: st.behind || 0,
          }};
        } catch {
          return null;
        }
      });
      for (const r of results) {
        if (!r) continue;
        this.gitCache.set(r.key, r.value);
      }
      this.lastGitRefreshAt = now;
    }
    if (this.gh.shouldRefresh()) {
      const wts = collected.map(it => ({project: it.project, path: it.path, is_archived: false as const}));
      await this.gh.refresh(wts, true);
    }

    // Group by feature across projects
    const byFeature = new Map<string, WorktreeSummary[]>();
    for (const it of collected) {
      const list = byFeature.get(it.feature) || [];
      list.push(it);
      byFeature.set(it.feature, list);
    }

    // Order features by most recent commit among children
    const ordered = [...byFeature.entries()].sort((a, b) => {
      const maxA = Math.max(...a[1].map(x => x.last_commit_ts || 0), 0);
      const maxB = Math.max(...b[1].map(x => x.last_commit_ts || 0), 0);
      return maxB - maxA;
    });

    const base = this.git.basePath;
    const final: WorktreeSummary[] = [];
    for (const [feature, children] of ordered) {
      const hasWS = this.workspace.hasWorkspaceForFeature(base, feature);
      if (!hasWS) {
        // No workspace: emit children as-is
        final.push(...children);
        continue;
      }
      // Workspace exists: create header and mark children
      const wsPath = path.join(base, 'workspaces', feature);
      const wsSession = this.tmux.sessionName('workspace', feature);
      const wsAttached = activeSessions.includes(wsSession);
      let wsTool: AITool | undefined = 'none';
      let wsStatus: AIStatus | undefined = 'not_running';
      if (wsAttached) {
        try {
          const res = await this.tmux.getAIStatus(wsSession);
          wsTool = res.tool;
          wsStatus = res.status;
        } catch {}
      }
      const header: WorktreeSummary = {
        project: 'workspace',
        feature,
        path: wsPath,
        branch: feature,
        session: wsSession,
        attached: wsAttached,
        ai_tool: wsTool,
        ai_status: wsStatus,
        is_workspace: true,
        is_workspace_header: true,
        status_label: computeStatusLabel({ai_status: wsStatus, attached: wsAttached}),
      };
      final.push(header);
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        const key = `${c.project}/${c.feature}`;
        const git = this.gitCache.get(key);
        const pr = this.gh.get(c.path);
        final.push({
          ...c,
          is_workspace: true,
          is_workspace_child: true,
          parent_feature: feature,
          has_changes: git?.has_changes,
          base_added_lines: git?.base_added_lines,
          base_deleted_lines: git?.base_deleted_lines,
          ahead: git?.ahead,
          behind: git?.behind,
          status_label: computeStatusLabel({
            ai_status: c.ai_status,
            attached: c.attached,
            has_changes: git?.has_changes,
            ahead: git?.ahead,
            behind: git?.behind,
            pr: pr || undefined,
          } as any),
        });
      }
    }
    // Enrich standalone rows (non-workspace)
    for (let i = 0; i < final.length; i++) {
      const it = final[i];
      if (it.is_workspace_header || it.is_workspace_child) continue;
      const key = `${it.project}/${it.feature}`;
      const git = this.gitCache.get(key);
      const pr = this.gh.get(it.path);
      final[i] = {
        ...it,
        has_changes: git?.has_changes,
        base_added_lines: git?.base_added_lines,
        base_deleted_lines: git?.base_deleted_lines,
        ahead: git?.ahead,
        behind: git?.behind,
        status_label: computeStatusLabel({
          ai_status: it.ai_status,
          attached: it.attached,
          has_changes: git?.has_changes,
          ahead: git?.ahead,
          behind: git?.behind,
          pr: pr || undefined,
        } as any),
      };
    }
    return final;
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
