export interface WorktreeSummary {
  project: string;
  feature: string;
  path: string;
  branch: string;
  // Optional runtime info (present when tmux is available)
  session?: string;
  attached?: boolean;
  ai_tool?: string;   // e.g., 'claude', 'none'
  ai_status?: string; // e.g., 'working', 'waiting', 'not_running'
}

export type ServerToClient =
  | {type: 'ready'; version: number; ts: number}
  | {type: 'worktrees.snapshot'; version: number; items: WorktreeSummary[]};

export type ClientToServer =
  | {type: 'hello'; subs?: string[]}
  | {type: 'get.worktrees'};

export interface SyncServerOptions {
  host?: string; // default 127.0.0.1
  port?: number; // default 8787
  path?: string; // default '/sync'
  refreshIntervalMs?: number; // default 30000
}

export interface SyncClientOptions {
  url: string; // ws://127.0.0.1:8787/sync
  autoSubscribe?: boolean; // worktrees
}
