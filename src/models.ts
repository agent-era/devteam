import {calculatePageSize} from './utils/pagination.js';
import {AI_TOOLS} from './constants.js';

export type AIStatus = 'not_running' | 'working' | 'waiting' | 'idle' | 'active';
export type AITool = keyof typeof AI_TOOLS | 'none';

export class GitStatus {
  has_changes: boolean;
  modified_files: number;
  added_lines: number;
  deleted_lines: number;
  untracked_lines: number;
  base_added_lines: number;
  base_deleted_lines: number;
  has_remote: boolean;
  ahead: number;
  behind: number;
  is_pushed: boolean;
  constructor(init: Partial<GitStatus> = {}) {
    this.has_changes = false;
    this.modified_files = 0;
    this.added_lines = 0;
    this.deleted_lines = 0;
    this.untracked_lines = 0;
    this.base_added_lines = 0;
    this.base_deleted_lines = 0;
    this.has_remote = false;
    this.ahead = 0;
    this.behind = 0;
    this.is_pushed = false;
    Object.assign(this, init);
  }
}

export type PRLoadingStatus = 
  | 'not_checked'    // Initial state, no API call made yet
  | 'loading'        // API call in progress
  | 'no_pr'          // API checked, no PR exists for this branch
  | 'exists'         // PR exists (use other fields for details)
  | 'error';         // API call failed

export class PRStatus {
  loadingStatus: PRLoadingStatus;
  number?: number | null;
  state?: string | null; // OPEN, MERGED, CLOSED
  checks?: string | null; // passing, failing, pending
  url?: string | null;
  head?: string | null;
  title?: string | null;
  mergeable?: string | null; // MERGEABLE, CONFLICTING, UNKNOWN
  constructor(init: Partial<PRStatus> = {}) {
    this.loadingStatus = 'not_checked';
    this.number = null;
    this.state = null;
    this.checks = null;
    this.url = null;
    this.title = null;
    this.mergeable = null;
    Object.assign(this, init);
  }
  
  // Loading state helpers
  get isLoading(): boolean { return this.loadingStatus === 'loading'; }
  get hasError(): boolean { return this.loadingStatus === 'error'; }
  get isNotChecked(): boolean { return this.loadingStatus === 'not_checked'; }
  get exists(): boolean { return this.loadingStatus === 'exists'; }
  get noPR(): boolean { return this.loadingStatus === 'no_pr'; }
  
  // PR state helpers
  get is_merged(): boolean { return this.state === 'MERGED'; }
  get is_open(): boolean { return this.state === 'OPEN'; }
  get is_closed(): boolean { return this.state === 'CLOSED'; }
  get has_conflicts(): boolean { return this.mergeable === 'CONFLICTING'; }
  get is_mergeable(): boolean { return this.mergeable === 'MERGEABLE'; }
  
  // Status aggregation helpers
  get needs_attention(): boolean { return this.checks === 'failing' || this.has_conflicts; }
  get is_ready_to_merge(): boolean { 
    return this.state === 'OPEN' && 
           this.checks === 'passing' && 
           this.mergeable === 'MERGEABLE' && 
           !this.isLoading; 
  }
}

export class SessionInfo {
  session_name: string;
  attached: boolean;
  ai_status: AIStatus;
  ai_tool: AITool;
  // Backward compatibility
  get claude_status(): string {
    return this.ai_status;
  }
  set claude_status(value: string) {
    this.ai_status = value as AIStatus;
  }
  constructor(init: Partial<SessionInfo> = {}) {
    this.session_name = '';
    this.attached = false;
    this.ai_status = 'not_running';
    this.ai_tool = 'none';
    Object.assign(this, init);
    
    // Handle backward compatibility during construction
    if ('claude_status' in init && init.claude_status && !('ai_status' in init)) {
      this.ai_status = init.claude_status as AIStatus;
      this.ai_tool = 'claude';
    }
  }
}

export class WorktreeInfo {
  project: string;
  feature: string;
  path: string;
  branch: string;
  git: GitStatus;
  session: SessionInfo;
  pr?: PRStatus;
  is_archived?: boolean;
  mtime?: number;
  last_commit_ts?: number;
  idleStartTime?: number | null;
  wasKilledIdle?: boolean;
  constructor(init: Partial<WorktreeInfo> = {}) {
    this.project = '';
    this.feature = '';
    this.path = '';
    this.branch = '';
    this.git = new GitStatus();
    this.session = new SessionInfo();
    this.is_archived = false;
    this.mtime = 0;
    this.last_commit_ts = 0;
    this.idleStartTime = null;
    this.wasKilledIdle = false;
    Object.assign(this, init);
  }

  get display_name(): string {
    return `${this.project}/${this.feature}`;
  }

  get needs_attention(): boolean {
    const aiStatus = this.session?.ai_status || 'not_running';
    if (aiStatus === 'waiting') return true;
    if (aiStatus === 'working') return false;
    if (this.git?.has_changes) return true;
    if ((this.git?.ahead || 0) > 0) return true;
    if (this.pr?.needs_attention) return true;
    if (this.pr?.number && this.pr?.is_open) return true;
    return false;
  }

  get action_priority(): number {
    const aiStatus = this.session?.ai_status || 'not_running';
    if (aiStatus === 'waiting') return 0;
    if (aiStatus === 'working') return 10;
    if (this.git?.has_changes) return 1;
    if ((this.git?.ahead || 0) > 0) return 2;
    if (this.pr?.needs_attention) return 3;
    if (this.pr?.is_ready_to_merge) return 4;
    if (this.pr?.number && this.pr?.is_open) return 5;
    return 10;
  }
}

export class ProjectInfo {
  name: string;
  path: string;
  constructor(init: Partial<ProjectInfo> = {}) {
    this.name = '';
    this.path = '';
    Object.assign(this, init);
  }
}

export class DiffComment {
  lineIndex: number;
  fileName: string;
  lineText: string;
  commentText: string;
  timestamp: number;
  constructor(init: Partial<DiffComment> = {}) {
    this.lineIndex = 0;
    this.fileName = '';
    this.lineText = '';
    this.commentText = '';
    this.timestamp = Date.now();
    Object.assign(this, init);
  }
}

export class CommentStore {
  comments: DiffComment[];
  constructor() {
    this.comments = [];
  }
  
  addComment(lineIndex: number, fileName: string, lineText: string, commentText: string): DiffComment {
    // Remove existing comment for this line if any
    this.comments = this.comments.filter(c => c.lineIndex !== lineIndex || c.fileName !== fileName);
    
    const comment = new DiffComment({
      lineIndex,
      fileName,
      lineText,
      commentText,
      timestamp: Date.now()
    });
    
    this.comments.push(comment);
    return comment;
  }
  
  removeComment(lineIndex: number, fileName: string): boolean {
    const initialLength = this.comments.length;
    this.comments = this.comments.filter(c => !(c.lineIndex === lineIndex && c.fileName === fileName));
    return this.comments.length < initialLength;
  }
  
  getComment(lineIndex: number, fileName: string): DiffComment | undefined {
    return this.comments.find(c => c.lineIndex === lineIndex && c.fileName === fileName);
  }
  
  hasComment(lineIndex: number, fileName: string): boolean {
    return this.comments.some(c => c.lineIndex === lineIndex && c.fileName === fileName);
  }
  
  getAllComments(): DiffComment[] {
    return [...this.comments].sort((a, b) => a.lineIndex - b.lineIndex);
  }
  
  clear(): void {
    this.comments = [];
  }
  
  get count(): number {
    return this.comments.length;
  }
}

export class AppState {
  worktrees: WorktreeInfo[];
  selectedIndex: number;
  page: number;
  pageSize: number;
  lastRefreshedAt: number;
  mode?: 'message' | 'prompt';
  message?: string;
  constructor(init: Partial<AppState> = {}) {
    this.worktrees = [];
    this.selectedIndex = 0;
    this.page = 0;
    this.pageSize = calculatePageSize();
    this.lastRefreshedAt = 0;
    Object.assign(this, init);
  }
}
