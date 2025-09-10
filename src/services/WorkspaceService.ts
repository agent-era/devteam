import fs from 'node:fs';
import path from 'node:path';
import {ensureDirectory} from '../shared/utils/fileSystem.js';

export class WorkspaceService {
  getWorkspacesDir(basePath: string): string {
    return path.join(basePath, 'workspaces');
  }

  getWorkspaceFeatureDir(basePath: string, featureName: string): string {
    return path.join(this.getWorkspacesDir(basePath), featureName);
  }

  hasWorkspaceForFeature(basePath: string, featureName: string): boolean {
    try {
      const dir = this.getWorkspaceFeatureDir(basePath, featureName);
      return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Create a workspace directory for a feature and symlink project worktrees into it.
   * Also create aggregated AGENTS.md and CLAUDE.md referencing project-level docs via relative paths.
   */
  createWorkspace(
    basePath: string,
    featureName: string,
    entries: Array<{project: string; worktreePath: string}>
  ): string {
    const workspacesDir = this.getWorkspacesDir(basePath);
    ensureDirectory(workspacesDir);
    const workspaceDir = this.getWorkspaceFeatureDir(basePath, featureName);
    ensureDirectory(workspaceDir);

    // Symlink each project's worktree under workspaceDir/<project>
    for (const {project, worktreePath} of entries) {
      try {
        const linkPath = path.join(workspaceDir, project);
        // Ensure absolute paths
        const target = path.resolve(worktreePath);
        const baseResolved = path.resolve(basePath) + path.sep;
        // Basic validation: target must live under basePath and inside the project's branches dir
        const branchesDir = path.resolve(path.join(basePath, `${project}-branches`)) + path.sep;
        const targetIsUnderBase = target.startsWith(baseResolved);
        const targetIsUnderBranches = target.startsWith(branchesDir);
        const targetEndsWithFeature = path.basename(target) === featureName;
        if (!targetIsUnderBase || !targetIsUnderBranches || !targetEndsWithFeature) {
          // Skip unsafe or unexpected targets
          continue;
        }
        // Replace existing file/dir/symlink if necessary
        try {
          if (fs.existsSync(linkPath)) fs.rmSync(linkPath, {recursive: true, force: true});
        } catch {}
        fs.symlinkSync(target, linkPath, 'dir');
      } catch {
        // Silent fail per UI ops guideline
      }
    }

    // Generate top-level aggregated docs
    this.writeAggregatedDocs(basePath, workspaceDir, entries.map(e => e.project));

    return workspaceDir;
  }

  private writeAggregatedDocs(basePath: string, workspaceDir: string, projects: string[]): void {
    const linesAgents: string[] = [
      `# Workspace Agents for: ${path.basename(workspaceDir)}`,
      '',
      'This workspace is a collection of related projects created to make a change that spans multiple codebases.',
      'Each project is its own git repository/worktree, so you will need to make commits and/or open PRs in each project as appropriate.',
      'Use the links below to open the per-project agent guide (AGENTS.md) or Claude notes (CLAUDE.md) where available:',
      ''
    ];
    const linesClaude: string[] = [
      `# Workspace Claude Notes for: ${path.basename(workspaceDir)}`,
      '',
      'This workspace groups several projects for a cross-repository change that spans these codebases.',
      'Each project is a separate git repository/worktree; expect to commit and/or raise PRs in each project.',
      'Links to per-project Claude notes (and agent guides where relevant):',
      ''
    ];

    for (const project of projects) {
      const projectRoot = path.join(basePath, project);
      const relToProject = path.relative(workspaceDir, projectRoot) || '.';
      const agentsPath = path.join(relToProject, 'AGENTS.md');
      const claudePath = path.join(relToProject, 'CLAUDE.md');
      const hasAgents = this.safeExists(path.join(projectRoot, 'AGENTS.md'));
      const hasClaude = this.safeExists(path.join(projectRoot, 'CLAUDE.md'));
      if (hasAgents) linesAgents.push(`- ${project}: ${agentsPath}`);
      if (hasClaude) linesClaude.push(`- ${project}: ${claudePath}`);
      if (!hasAgents && !hasClaude) {
        // Fall back to README if neither exists
        const readmePath = path.join(relToProject, 'README.md');
        linesAgents.push(`- ${project}: ${readmePath}`);
        linesClaude.push(`- ${project}: ${readmePath}`);
      }
    }

    try {
      fs.writeFileSync(path.join(workspaceDir, 'AGENTS.md'), linesAgents.join('\n'));
    } catch {}
    try {
      fs.writeFileSync(path.join(workspaceDir, 'CLAUDE.md'), linesClaude.join('\n'));
    } catch {}
  }

  private safeExists(p: string): boolean {
    try { return fs.existsSync(p); } catch { return false; }
  }
}
