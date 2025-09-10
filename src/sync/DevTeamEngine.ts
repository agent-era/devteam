import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {getProjectsDirectory} from '../config.js';
import {GitService} from '../services/GitService.js';
import {TmuxService} from '../services/TmuxService.js';
import type {WorktreeSummary} from './types.js';
import type {AITool, AIStatus} from '../models.js';

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
}

