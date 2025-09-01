import {WorktreeInfo, ProjectInfo, SessionInfo} from '../../src/models.js';
import {FakeGitService} from './FakeGitService.js';
import {FakeTmuxService} from './FakeTmuxService.js';
import {memoryStore} from './stores.js';

/**
 * Fake WorktreeService that orchestrates git and tmux operations for testing
 * This simulates the complex operations that WorktreeContext performs
 */
export class FakeWorktreeService {
  constructor(
    public gitService = new FakeGitService(),
    public tmuxService = new FakeTmuxService()
  ) {}

  /**
   * Create a new feature worktree and associated tmux session
   */
  async createFeature(projectName: string, featureName: string): Promise<WorktreeInfo | null> {
    try {
      // Check if project exists
      const project = memoryStore.projects.get(projectName);
      if (!project) {
        throw new Error(`Project ${projectName} not found`);
      }

      // Create worktree through git service
      const success = this.gitService.createWorktree(projectName, featureName);
      if (!success) {
        return null;
      }

      // Get the created worktree
      const worktrees = Array.from(memoryStore.worktrees.values());
      const worktree = worktrees.find(w => 
        w.project === projectName && w.feature === featureName
      );

      if (!worktree) {
        throw new Error('Worktree creation succeeded but worktree not found');
      }

      // Create tmux session
      const sessionName = this.tmuxService.sessionName(projectName, featureName);
      this.tmuxService.createSession(sessionName, worktree.path);

      // Link session to worktree
      const session = memoryStore.sessions.get(sessionName);
      if (session) {
        worktree.session = session;
        memoryStore.worktrees.set(worktree.path, worktree);
      }

      return worktree;
    } catch (error) {
      console.error('Failed to create feature:', error);
      return null;
    }
  }

  /**
   * Archive a feature (move worktree and clean up session)
   */
  async archiveFeature(
    worktreeOrProject: WorktreeInfo | string, 
    path?: string, 
    feature?: string
  ): Promise<{archivedPath: string}> {
    let worktree: WorktreeInfo;

    if (typeof worktreeOrProject === 'string') {
      // Called with project name
      if (!path || !feature) {
        throw new Error('path and feature required when using project name');
      }
      const foundWorktree = Array.from(memoryStore.worktrees.values())
        .find(w => w.project === worktreeOrProject && w.feature === feature);
      
      if (!foundWorktree) {
        throw new Error(`Worktree not found: ${worktreeOrProject}/${feature}`);
      }
      worktree = foundWorktree;
    } else {
      // Called with WorktreeInfo object
      worktree = worktreeOrProject;
    }

    // Archive the worktree through git service
    const archivedPath = this.gitService.archiveWorktree(worktree.path);

    // Kill associated tmux session
    if (worktree.session?.session_name) {
      this.tmuxService.killSession(worktree.session.session_name);
    }

    // Kill shell and run sessions too
    const shellSessionName = `${worktree.session?.session_name}-shell`;
    const runSessionName = `${worktree.session?.session_name}-run`;
    
    if (this.tmuxService.hasSession(shellSessionName)) {
      this.tmuxService.killSession(shellSessionName);
    }
    
    if (this.tmuxService.hasSession(runSessionName)) {
      this.tmuxService.killSession(runSessionName);
    }

    return {archivedPath};
  }

  /**
   * Create worktree from remote branch
   */
  async createFromBranch(project: string, remoteBranch: string, localName: string): Promise<boolean> {
    try {
      // Simulate creating from remote branch
      const success = this.gitService.createWorktree(project, localName, `origin/${remoteBranch}`);
      
      if (success) {
        // Create associated session
        const sessionName = this.tmuxService.sessionName(project, localName);
        const worktreePath = `/fake/projects/${project}-branches/${localName}`;
        this.tmuxService.createSession(sessionName, worktreePath);
      }
      
      return success;
    } catch (error) {
      console.error('Failed to create from branch:', error);
      return false;
    }
  }

  /**
   * Delete archived worktree
   */
  async deleteArchived(archivedPath: string): Promise<boolean> {
    try {
      // Find and remove from archived list
      for (const [project, archived] of memoryStore.archivedWorktrees.entries()) {
        const index = archived.findIndex(w => w.path === archivedPath);
        if (index !== -1) {
          archived.splice(index, 1);
          if (archived.length === 0) {
            memoryStore.archivedWorktrees.delete(project);
          } else {
            memoryStore.archivedWorktrees.set(project, archived);
          }
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Failed to delete archived:', error);
      return false;
    }
  }

  /**
   * Unarchive a feature (move from archived back to active)
   */
  async unarchiveFeature(archivedPath: string): Promise<{restoredPath: string}> {
    try {
      // Find the archived worktree to get project info for session creation
      let archivedWorktree: WorktreeInfo | null = null;
      
      for (const [project, archived] of memoryStore.archivedWorktrees.entries()) {
        const found = archived.find(w => w.path === archivedPath);
        if (found) {
          archivedWorktree = found;
          break;
        }
      }
      
      if (!archivedWorktree) {
        throw new Error(`Archived worktree not found: ${archivedPath}`);
      }

      // Restore the worktree through git service
      const restoredPath = this.gitService.unarchiveWorktree(archivedPath);

      // Recreate tmux sessions for the restored worktree
      const sessionName = this.tmuxService.sessionName(archivedWorktree.project, archivedWorktree.feature);
      this.tmuxService.createSession(sessionName, restoredPath);

      // Get the restored worktree and link it to the session
      const restoredWorktree = memoryStore.worktrees.get(restoredPath);
      const session = memoryStore.sessions.get(sessionName);
      if (restoredWorktree && session) {
        restoredWorktree.session = session;
        memoryStore.worktrees.set(restoredPath, restoredWorktree);
      }

      return {restoredPath};
    } catch (error) {
      console.error('Failed to unarchive feature:', error);
      throw error;
    }
  }

  /**
   * Attach to main Claude session
   */
  async attachSession(worktree: WorktreeInfo): Promise<void> {
    if (!worktree.session?.session_name) {
      throw new Error('No session found for worktree');
    }

    // Simulate attaching to session (in real implementation would attach to tmux)
    // For fake implementation, we just verify the session exists
  }

  /**
   * Attach to shell session
   */
  async attachShellSession(worktree: WorktreeInfo): Promise<void> {
    const shellSessionName = `${worktree.session?.session_name}-shell`;
    
    // Create shell session if it doesn't exist
    if (!this.tmuxService.hasSession(shellSessionName)) {
      this.tmuxService.createSession(shellSessionName, worktree.path);
    }
    
    // Simulate attaching to shell session
    // For fake implementation, session creation is sufficient
  }

  /**
   * Attach to run session
   */
  async attachRunSession(worktree: WorktreeInfo): Promise<'success' | 'no_config'> {
    const runSessionName = `${worktree.session?.session_name}-run`;
    
    // Check if run config exists (simulate)
    const hasRunConfig = Math.random() > 0.3; // 70% chance of having config
    
    if (!hasRunConfig) {
      return 'no_config';
    }
    
    // Create run session if it doesn't exist
    if (!this.tmuxService.hasSession(runSessionName)) {
      this.tmuxService.createSession(runSessionName, worktree.path);
    }
    
    // Simulate attaching to run session
    // For fake implementation, session creation is sufficient
    return 'success';
  }

  /**
   * Discover projects from memory store
   */
  discoverProjects(): ProjectInfo[] {
    return Array.from(memoryStore.projects.values());
  }

  /**
   * Get archived worktrees for a project
   */
  getArchivedForProject(project: ProjectInfo): WorktreeInfo[] {
    return memoryStore.archivedWorktrees.get(project.name) || [];
  }

  /**
   * Get remote branches for a project
   */
  async getRemoteBranches(project: string): Promise<Array<{
    local_name: string;
    remote_name: string;
    pr_number?: number;
    pr_state?: string;
    pr_checks?: string;
    pr_title?: string;
  }>> {
    return memoryStore.remoteBranches.get(project) || [];
  }

  /**
   * Get run config path for project
   */
  getRunConfigPath(project: string): string {
    return `/fake/projects/${project}/run.json`;
  }

  /**
   * Create or fill run config
   */
  async createOrFillRunConfig(project: string): Promise<{
    success: boolean; 
    content?: string; 
    path: string; 
    error?: string;
  }> {
    const path = this.getRunConfigPath(project);
    
    try {
      const content = JSON.stringify({
        commands: {
          dev: "npm run dev",
          test: "npm test",
          build: "npm run build"
        }
      }, null, 2);
      
      return {
        success: true,
        content,
        path
      };
    } catch (error) {
      return {
        success: false,
        path,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Refresh worktree data (simulate collecting from filesystem)
   */
  async refresh(): Promise<void> {
    // Simulate filesystem scan delay
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Update session statuses randomly
    for (const session of memoryStore.sessions.values()) {
      const statuses = ['idle', 'working', 'waiting', 'thinking'];
      session.claude_status = statuses[Math.floor(Math.random() * statuses.length)];
    }
  }

  /**
   * Batch operation: create multiple features
   */
  async createMultipleFeatures(
    project: string, 
    features: string[]
  ): Promise<{created: WorktreeInfo[], failed: string[]}> {
    const created: WorktreeInfo[] = [];
    const failed: string[] = [];
    
    for (const feature of features) {
      try {
        const worktree = await this.createFeature(project, feature);
        if (worktree) {
          created.push(worktree);
        } else {
          failed.push(feature);
        }
      } catch (error) {
        failed.push(feature);
      }
    }
    
    return {created, failed};
  }

  /**
   * Get all active worktrees
   */
  getAllWorktrees(): WorktreeInfo[] {
    return Array.from(memoryStore.worktrees.values());
  }

  /**
   * Get worktrees for specific project
   */
  getWorktreesForProject(projectName: string): WorktreeInfo[] {
    return this.getAllWorktrees().filter(w => w.project === projectName);
  }

  /**
   * Check if a feature name is available
   */
  isFeatureNameAvailable(project: string, feature: string): boolean {
    return !this.getAllWorktrees().some(w => 
      w.project === project && w.feature === feature
    );
  }

  /**
   * Get session status for worktree
   */
  async getSessionStatus(worktree: WorktreeInfo): Promise<string> {
    if (!worktree.session?.session_name) {
      return 'not_running';
    }
    
    return await this.tmuxService.getClaudeStatus(worktree.session.session_name);
  }

  /**
   * Kill all sessions for a worktree
   */
  async killAllSessions(worktree: WorktreeInfo): Promise<void> {
    if (worktree.session?.session_name) {
      const baseName = worktree.session.session_name;
      
      // Kill main session
      if (this.tmuxService.hasSession(baseName)) {
        this.tmuxService.killSession(baseName);
      }
      
      // Kill shell session
      const shellName = `${baseName}-shell`;
      if (this.tmuxService.hasSession(shellName)) {
        this.tmuxService.killSession(shellName);
      }
      
      // Kill run session
      const runName = `${baseName}-run`;
      if (this.tmuxService.hasSession(runName)) {
        this.tmuxService.killSession(runName);
      }
    }
  }
}