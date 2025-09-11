import type {AIStatus, AITool, WorktreeInfo} from '../models.js';

export type WorktreeSummary =
  // Reuse core fields from the existing model
  Pick<WorktreeInfo, 'project' | 'feature' | 'path' | 'branch'> & {
    // Optional runtime info (present when tmux is available)
    session?: string;
    attached?: boolean;
    ai_tool?: AITool;    // e.g., 'claude', 'none'
    ai_status?: AIStatus; // e.g., 'working', 'waiting', 'not_running'
    // Lightweight Git status for web UI
    has_changes?: boolean;
    base_added_lines?: number;
    base_deleted_lines?: number;
    ahead?: number;
    behind?: number;
    // Centralized status label for clients (TUI-aligned wording)
    status_label?: string;
    // Workspace flags (flat snapshot; UI can group)
    is_workspace?: boolean;
    is_workspace_header?: boolean;
    is_workspace_child?: boolean;
    parent_feature?: string;
    // Optional timestamp for ordering
    last_commit_ts?: number;
  };

export type ServerToClient =
  | {type: 'ready'; version: number; ts: number}
  | {type: 'worktrees.snapshot'; version: number; items: WorktreeSummary[]};

export type ClientToServer =
  | {type: 'hello'; subs?: string[]}
  | {type: 'get.worktrees'};

export interface SyncServerOptions {
  // HTTP endpoint to post snapshots to (Next.js web server)
  postUrl?: string; // default 'http://127.0.0.1:3000/api/snapshots/push'
  refreshIntervalMs?: number; // default 30000
  gitRefreshIntervalMs?: number; // default 15000 (lightweight cache refresh)
}

export interface SyncClientOptions {
  url: string; // retained for compatibility (unused in HTTP mode)
  autoSubscribe?: boolean; // worktrees
}
