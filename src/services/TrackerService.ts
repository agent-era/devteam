import fs from 'node:fs';
import path from 'node:path';
import {ensureDirectory, extractJsonObject, readFileOrNull, writeJSONAtomic} from '../shared/utils/fileSystem.js';
import {runClaudeAsync, runCommandQuick} from '../shared/utils/commandExecutor.js';
import {DIR_BRANCHES_SUFFIX} from '../constants.js';

export interface ProposalCandidate {
  title: string;
  slug: string;
  description: string;
}

export type ExitCriterionCheck =
  | 'requirements_has_body'
  | 'requirements_min_50_words'
  | 'has_implementation_notes'
  | 'has_notes'
  | 'worktree_exists';

export interface ExitCriterion {
  id: string;
  description: string;
  check: ExitCriterionCheck;
}

export interface ExitCriterionResult {
  criterion: ExitCriterion;
  met: boolean;
}

export interface StageConfig {
  actionLabel: string;
  description: string;
  checklist: string[];
  agentPrompt: string;
  exitCriteria: ExitCriterion[];
  settings?: Record<string, string>;
}

export type DecisionStyle = 'ask' | 'recommend' | 'decide';
export type VerbosityStyle = 'brief' | 'detailed';
export type PlanningStyle = 'dive_in' | 'plan_first' | 'plan_approval';
export type QuestionsStyle = 'minimal' | 'one_at_a_time' | 'batch';
export type CodeScopeStyle = 'minimal' | 'clean_as_go' | 'thorough';
export type TestingStyle = 'always' | 'suggest' | 'skip';
export type CommitStyle = 'never' | 'milestones' | 'often';
export type BlockerStyle = 'ask' | 'try_first' | 'continue';
export type ContextDepthStyle = 'light' | 'moderate' | 'deep';

export interface WorkStyle {
  decisionStyle: DecisionStyle;
  verbosity: VerbosityStyle;
  planning: PlanningStyle;
  questions: QuestionsStyle;
  codeScope: CodeScopeStyle;
  testing: TestingStyle;
  commits: CommitStyle;
  onBlockers: BlockerStyle;
  contextDepth: ContextDepthStyle;
  customInstructions: string;
}

export const DEFAULT_WORK_STYLE: WorkStyle = {
  decisionStyle: 'recommend',
  verbosity: 'brief',
  planning: 'dive_in',
  questions: 'batch',
  codeScope: 'minimal',
  testing: 'suggest',
  commits: 'never',
  onBlockers: 'ask',
  contextDepth: 'moderate',
  customInstructions: '',
};

export type StagesConfig = Partial<Record<Exclude<TrackerStage, 'archive'>, StageConfig>>;

const DEFAULT_STAGES_CONFIG: Required<StagesConfig> = {
  backlog: {
    actionLabel: 'Launch feature discovery',
    description: 'New ideas and items to triage. Not yet being worked on.',
    checklist: [
      'Add a descriptive title',
      'Rough estimate of value and effort',
      'Decide whether to pursue',
    ],
    agentPrompt: `Research the project context (CLAUDE.md, README, existing tracker items, codebase) and this item's current state. Then ask the user 1–3 brief, high-entropy questions — focus only on decisions that actually matter for whether and how to pursue this. Give a clear recommendation with reasoning. Use the ask questions tool if available.`,
    exitCriteria: [
      {id: 'req-body', description: 'Has a description in requirements', check: 'requirements_has_body'},
    ],
    settings: {auto_discover: 'prompt'},
  },
  discovery: {
    actionLabel: 'Write requirements',
    description: 'Clarify what user problem this solves and whether the approach is right. Quick for most tasks — only go deep if genuinely uncertain.',
    checklist: [
      'Identify the user problem being solved (not just the solution)',
      'Check if similar solutions exist in the codebase or ecosystem',
      'Do a quick web search if the problem domain is unfamiliar',
      'Flag any constraints or risks worth knowing upfront',
      'Write a brief note to notes.md',
    ],
    agentPrompt: `Goal: clarify what user problem this item is solving and whether the proposed approach makes sense. This should be lightweight for most tasks — don't over-engineer it.

Steps:
1. Read the item title and any existing context. Ask yourself: what is the actual user problem here?
2. Do a quick scan of the codebase for relevant context.
3. If the problem domain is unfamiliar or involves external tools/APIs, do a brief web search.
4. Ask the user 1–3 high-value questions if anything is genuinely unclear — use the ask questions tool if available. Focus on the "why" and "what", not the "how" yet.

Write your findings to tracker/items/<slug>/notes.md. Keep it short: user problem, key findings, your recommendation. Do NOT write to requirements.md — that's the next stage.`,
    exitCriteria: [
      {id: 'has-notes', description: 'Discovery notes written to notes.md', check: 'has_notes'},
    ],
    settings: {skip: 'always_run', depth: 'normal'},
  },
  requirements: {
    actionLabel: 'Start implement',
    description: 'Document detailed requirements, acceptance criteria, and edge cases.',
    checklist: [
      'Write acceptance criteria',
      'Define edge cases',
      'Identify dependencies',
      'Confirm scope with stakeholders',
    ],
    agentPrompt: `Read the discovery notes (tracker/items/<slug>/notes.md) and the current requirements stub. Then interview the user with targeted questions about acceptance criteria, edge cases, and constraints — keep it brief, prioritise high-value questions. Use the ask questions tool if available. After gathering answers, draft requirements section by section, presenting each for approval before moving on. Write to tracker/items/<slug>/requirements.md as you go.`,
    exitCriteria: [
      {id: 'req-words', description: 'Requirements have sufficient detail (50+ words)', check: 'requirements_min_50_words'},
    ],
    settings: {style: 'interview', detail: 'standard'},
  },
  implement: {
    actionLabel: 'Move to cleanup',
    description: 'Build the feature. Follow TDD, commit incrementally.',
    checklist: [
      'Review requirements before starting',
      'Write tests first',
      'Implement incrementally with commits',
      'Keep implementation focused on requirements',
    ],
    agentPrompt: `Explore the codebase first: understand existing patterns, test setup, conventions, and how this feature fits in. Then ask 2–3 key questions about the implementation approach and any decisions that need the user's input — use the ask questions tool if available. Keep it brief. Once aligned, start with failing tests.`,
    exitCriteria: [
      {id: 'worktree', description: 'Worktree exists', check: 'worktree_exists'},
      {id: 'impl-notes', description: 'Implementation notes written', check: 'has_implementation_notes'},
    ],
    settings: {tdd: 'suggested', start_with: 'explore'},
  },
  cleanup: {
    actionLabel: 'Archive item',
    description: 'Clean up, refactor, write tests, and prepare for submission.',
    checklist: [
      'All tests passing',
      'Code reviewed and refactored',
      'Documentation updated',
      'PR description written',
    ],
    agentPrompt: `Review what's been done: check tests, read the diff, identify cleanup opportunities. Use the ask questions tool if available for any decisions that need the user's input. Be brief and practical. Focus on getting this across the finish line.`,
    exitCriteria: [
      {id: 'impl-notes', description: 'Implementation notes exist', check: 'has_implementation_notes'},
    ],
    settings: {scope: 'standard'},
  },
};

export type TrackerBacklogStage = 'backlog' | 'discovery' | 'requirements';
export type TrackerImplementationStage = 'implement' | 'cleanup';
export type TrackerStage =
  | TrackerBacklogStage
  | TrackerImplementationStage
  | 'archive';

export type TrackerBucket = 'backlog' | 'implementation' | 'archive';

export interface TrackerIndex {
  backlog?: Partial<Record<TrackerBacklogStage, string[]>>;
  implementation?: Partial<Record<TrackerImplementationStage, string[]>>;
  archive?: string[];
  // Sidecar metadata keyed by slug (currently just the title, used to display items
  // on the board before their requirements file is materialised).
  sessions?: Record<string, {title?: string}>;
}

export interface TrackerFrontmatter {
  title?: string;
  slug?: string;
  updated?: string;
  [key: string]: string | undefined;
}

export interface TrackerItem {
  slug: string;
  title: string;
  project: string;
  projectPath: string;
  bucket: TrackerBucket;
  stage: TrackerStage;
  itemDir: string;
  requirementsPath: string;
  implementationPath: string;
  notesPath: string;
  requirementsBody: string;
  frontmatter: TrackerFrontmatter;
  hasImplementationNotes: boolean;
  hasNotes: boolean;
  worktreePath?: string;
  worktreeExists: boolean;
}

export interface TrackerColumn {
  id: TrackerStage;
  title: string;
  bucket: TrackerBucket;
  items: TrackerItem[];
}

export interface TrackerBoard {
  project: string;
  projectPath: string;
  trackerPath: string;
  columns: TrackerColumn[];
}

const BACKLOG_STAGES: TrackerBacklogStage[] = ['backlog', 'discovery', 'requirements'];
const IMPLEMENTATION_STAGES: TrackerImplementationStage[] = ['implement', 'cleanup'];
const STAGE_ORDER: TrackerStage[] = ['backlog', 'discovery', 'requirements', 'implement', 'cleanup', 'archive'];

// Single source of truth for stage labels. Used by the board column titles, the item
// screen header/buttons, and the prompt sent to the agent when launching a session.
export const STAGE_LABELS: Record<TrackerStage, string> = {
  backlog: 'Discovery',
  discovery: 'Discovery',
  requirements: 'Requirements',
  implement: 'Implement',
  cleanup: 'Cleanup',
  archive: 'Archive',
};

// Wider title used for the board column header (where space allows a longer label).
const COLUMN_TITLES: Record<TrackerStage, string> = {
  ...STAGE_LABELS,
  cleanup: 'Cleanup and Submit',
};

export class TrackerService {
  getTrackerPath(projectPath: string): string {
    return path.join(projectPath, 'tracker');
  }

  getIndexPath(projectPath: string): string {
    return path.join(this.getTrackerPath(projectPath), 'index.json');
  }

  getBucketPath(projectPath: string, bucket: TrackerBucket): string {
    return path.join(this.getTrackerPath(projectPath), bucket);
  }

  // Worktree-based item file location. All non-archived item content lives at
  // <wt>/tracker/items/<slug>/ inside the item's worktree. Archived items stay in
  // the main project at <projectPath>/tracker/archive/<slug>/.
  getWorktreePathForSlug(projectPath: string, slug: string): string {
    const projectsDir = path.dirname(projectPath);
    const projectName = path.basename(projectPath);
    return path.join(projectsDir, `${projectName}${DIR_BRANCHES_SUFFIX}`, slug);
  }

  getItemDirInWorktree(projectPath: string, slug: string): string {
    return path.join(this.getWorktreePathForSlug(projectPath, slug), 'tracker', 'items', slug);
  }

  getArchiveItemDir(projectPath: string, slug: string): string {
    return path.join(this.getBucketPath(projectPath, 'archive'), slug);
  }

  // Resolves to the worktree-based item dir if it exists, otherwise falls back to any
  // legacy main-project bucket dir (and the canonical archive dir) for backwards
  // compatibility with pre-refactor items.
  resolveItemDir(projectPath: string, slug: string): string | null {
    const wtItemDir = this.getItemDirInWorktree(projectPath, slug);
    if (fs.existsSync(wtItemDir)) return wtItemDir;
    // Legacy worktree path (pre-`items/` rename).
    const legacyWtDir = path.join(this.getWorktreePathForSlug(projectPath, slug), 'tracker', slug);
    if (fs.existsSync(legacyWtDir)) return legacyWtDir;
    // Stub written by createItem before a worktree exists.
    const mainItemDir = path.join(projectPath, 'tracker', 'items', slug);
    if (fs.existsSync(mainItemDir)) return mainItemDir;
    // Archive lives in the main project regardless of worktree existence.
    const archiveDir = this.getArchiveItemDir(projectPath, slug);
    if (fs.existsSync(archiveDir)) return archiveDir;
    // Pre-refactor main-project bucket layout.
    for (const bucket of ['backlog', 'implementation'] as TrackerBucket[]) {
      const dir = path.join(this.getBucketPath(projectPath, bucket), slug);
      if (fs.existsSync(dir)) return dir;
    }
    return null;
  }

  ensureTracker(projectPath: string): void {
    ensureDirectory(this.getTrackerPath(projectPath));
    // Active items live in `<worktree>/tracker/items/<slug>/`; only the archive bucket
    // is kept in the main project.
    ensureDirectory(this.getBucketPath(projectPath, 'archive'));
    const indexPath = this.getIndexPath(projectPath);
    if (!fs.existsSync(indexPath)) {
      writeJSONAtomic(indexPath, {
        backlog: {
          backlog: [],
          discovery: [],
          requirements: [],
        },
        implementation: {
          implement: [],
          cleanup: [],
        },
        archive: [],
      } satisfies TrackerIndex);
    }
  }

  loadBoard(project: string, projectPath: string): TrackerBoard {
    this.ensureTracker(projectPath);
    this.reconcileAutoAdvance(projectPath);
    const index = this.readIndex(projectPath);
    const stageBySlug = this.createStageBySlug(index);
    const allItems = this.loadItems(project, projectPath, stageBySlug);
    const itemBySlug = new Map(allItems.map(item => [item.slug, item]));

    const buildColumn = (id: TrackerStage, bucket: TrackerBucket, orderedSlugs: string[]): TrackerColumn => {
      const ordered: TrackerItem[] = [];
      const seen = new Set<string>();
      for (const slug of orderedSlugs) {
        const item = itemBySlug.get(slug);
        if (!item) continue;
        ordered.push(item);
        seen.add(slug);
      }
      const extras = allItems
        .filter(item => item.stage === id && !seen.has(item.slug))
        .sort((a, b) => a.slug.localeCompare(b.slug));
      return {
        id,
        title: COLUMN_TITLES[id],
        bucket,
        items: [...ordered, ...extras],
      };
    };

    // Backlog and discovery are merged into a single display column
    const backlogDiscovery = buildColumn('backlog', 'backlog', [
      ...(index.backlog?.backlog || []),
      ...(index.backlog?.discovery || []),
    ]);
    // Include any discovery items not already in the ordered list
    const seenSlugs = new Set(backlogDiscovery.items.map(i => i.slug));
    const discoveryExtras = allItems.filter(
      item => item.stage === 'discovery' && !seenSlugs.has(item.slug)
    );
    backlogDiscovery.items = [...backlogDiscovery.items, ...discoveryExtras];

    return {
      project,
      projectPath,
      trackerPath: this.getTrackerPath(projectPath),
      columns: [
        backlogDiscovery,
        buildColumn('requirements', 'backlog', index.backlog?.requirements || []),
        buildColumn('implement', 'implementation', index.implementation?.implement || []),
        buildColumn('cleanup', 'implementation', index.implementation?.cleanup || []),
      ],
    };
  }

  slugify(title: string, maxLength = 20): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, maxLength);
  }

  private isValidSlug(slug: string): boolean {
    return /^[a-z0-9][a-z0-9-]*$/.test(slug);
  }

  nextStage(stage: TrackerStage): TrackerStage | null {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
    return STAGE_ORDER[idx + 1];
  }

  previousStage(stage: TrackerStage): TrackerStage | null {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx <= 0) return null;
    return STAGE_ORDER[idx - 1];
  }

  createItem(projectPath: string, title: string, stage: TrackerStage = 'discovery', explicitSlug?: string, body?: string): void {
    const slug = explicitSlug || this.slugify(title);
    // Reject anything that isn't a plain slug — slugs are interpolated into file
    // paths, so a stray '.' or '/' would let a crafted title escape the tracker dir.
    if (!slug || !this.isValidSlug(slug)) return;
    // Idempotent: if the slug is already in the index at the requested stage, do
    // nothing. Avoids double-create when the orphan-materialise handler races a
    // re-render that triggers Enter twice.
    if (this.hasTracker(projectPath)) {
      const stageBySlug = this.createStageBySlug(this.readIndex(projectPath));
      if (stageBySlug.get(slug) === stage) return;
    }
    this.ensureTracker(projectPath);
    const index = this.readIndex(projectPath);
    this.removeSlugFromIndexObj(index, slug);
    this.addSlugToIndexObj(index, slug, stage);
    const sessions = (index.sessions ?? {}) as NonNullable<TrackerIndex['sessions']>;
    sessions[slug] = {...sessions[slug], title};
    index.sessions = sessions;
    writeJSONAtomic(this.getIndexPath(projectPath), index);
    const mainItemDir = path.join(projectPath, 'tracker', 'items', slug);
    ensureDirectory(mainItemDir);
    // Requirements is just a stub with the title — it's written for real during
    // the requirements stage. The user's initial description (the "what / why"
    // they had in mind when they created the item) goes into notes.md, which is
    // the discovery stage's output file.
    this.writeRequirementsStub(path.join(mainItemDir, 'requirements.md'), title, slug, title);
    if (body && body !== title) {
      const notesPath = path.join(mainItemDir, 'notes.md');
      if (!fs.existsSync(notesPath)) fs.writeFileSync(notesPath, `${body}\n`);
    }
  }

  private writeRequirementsStub(reqPath: string, title: string, slug: string, body: string): boolean {
    if (fs.existsSync(reqPath)) return false;
    const today = new Date().toISOString().slice(0, 10);
    // Strip newlines and quote the title so YAML-significant characters (":",
    // "'", "[", "!") in user-typed titles can't forge frontmatter keys.
    const yamlTitle = JSON.stringify(title.replace(/[\r\n]+/g, ' ').trim());
    fs.writeFileSync(reqPath, `---\ntitle: ${yamlTitle}\nslug: ${slug}\nupdated: ${today}\n---\n\n${body}\n`);
    return true;
  }

  async deriveSlug(title: string, existingSlugs: string[]): Promise<string> {
    const maxLen = 30;
    const prompt = `Generate a concise kebab-case slug (2-4 words, max ${maxLen} chars) for this tracker item. Reply with ONLY the slug, nothing else.\n\nTitle: ${title}`;
    const result = await runClaudeAsync(prompt, {timeoutMs: 8000});
    let derived = this.slugify(title);
    if (result.success && result.output) {
      const candidate = this.slugify(result.output.trim(), maxLen);
      if (candidate && this.isValidSlug(candidate)) derived = candidate;
    }
    if (!existingSlugs.includes(derived)) return derived;
    let i = 2;
    while (existingSlugs.includes(`${derived}-${i}`)) i++;
    return `${derived}-${i}`;
  }

  moveItem(projectPath: string, slug: string, toStage: TrackerStage): boolean {
    const index = this.readIndex(projectPath);
    const currentStage = this.createStageBySlug(index).get(slug);
    if (!currentStage || currentStage === toStage) return false;
    this.removeSlugFromIndexObj(index, slug);
    this.addSlugToIndexObj(index, slug, toStage);
    writeJSONAtomic(this.getIndexPath(projectPath), index);
    return true;
  }

  // Auto-advance items based on signals in their files:
  //   backlog → discovery: always (backlog stage is deprecated, rolled into discovery)
  //   discovery → requirements: when requirements.md contains a real heading section
  // Reads the index once, mutates in place, and writes once if anything moved.
  reconcileAutoAdvance(projectPath: string): void {
    if (!this.hasTracker(projectPath)) return;
    const index = this.readIndex(projectPath);
    let dirty = false;

    for (const slug of [...(index.backlog?.backlog || [])]) {
      this.removeSlugFromIndexObj(index, slug);
      this.addSlugToIndexObj(index, slug, 'discovery');
      dirty = true;
    }

    for (const slug of [...(index.backlog?.discovery || [])]) {
      const itemDir = this.resolveItemDir(projectPath, slug);
      if (!itemDir) continue;
      const reqPath = path.join(itemDir, 'requirements.md');
      const raw = readFileOrNull(reqPath);
      if (!raw) continue;
      const {body} = parseFrontmatter(raw);
      // Advance when there's a real markdown heading section beyond the boilerplate title line
      if (/^#{1,3}\s+\S/m.test(body)) {
        this.removeSlugFromIndexObj(index, slug);
        this.addSlugToIndexObj(index, slug, 'requirements');
        dirty = true;
      }
    }

    if (dirty) writeJSONAtomic(this.getIndexPath(projectPath), index);
  }

  // Ensures the item's content files exist inside the worktree at
  // <wt>/tracker/items/<slug>/. Migrates files from any legacy location (older
  // `<wt>/tracker/<slug>/` layout, or pre-refactor main-project bucket dirs) if
  // present, otherwise creates a fresh requirements.md stub. Commits to the worktree
  // branch so the seed survives a future worktree obliteration.
  ensureItemFiles(mainProjectPath: string, slug: string, worktreePath: string, item?: TrackerItem): void {
    const destDir = path.join(worktreePath, 'tracker', 'items', slug);
    ensureDirectory(destDir);
    const reqPath = path.join(destDir, 'requirements.md');

    let wroteAnything = false;

    // 1) Migrate from legacy locations (highest priority first), then the main-project
    // stub written by createItem as a last resort.
    const legacySources = [
      path.join(worktreePath, 'tracker', slug),
      ...this.findLegacyMainProjectDirs(mainProjectPath, slug),
      path.join(mainProjectPath, 'tracker', 'items', slug),
    ].filter(p => fs.existsSync(p));
    for (const src of legacySources) {
      for (const file of fs.readdirSync(src)) {
        const destFile = path.join(destDir, file);
        if (fs.existsSync(destFile)) continue;
        fs.copyFileSync(path.join(src, file), destFile);
        wroteAnything = true;
      }
    }

    // 2) If we still have no requirements.md, write a fresh stub.
    const stubTitle = item?.title || slug;
    if (this.writeRequirementsStub(reqPath, stubTitle, slug, stubTitle)) {
      wroteAnything = true;
    }

    // 3) Commit the seeded files only if we actually wrote something. Skipping the
    // empty-commit attempt avoids a couple of git fork+exec calls on every reattach.
    if (!wroteAnything) return;
    const relativeDestDir = path.relative(worktreePath, destDir);
    runCommandQuick(['git', '-C', worktreePath, 'add', relativeDestDir]);
    runCommandQuick(['git', '-C', worktreePath, 'commit', '-m', `tracker: seed item files for ${slug}`]);
  }

  private findLegacyMainProjectDirs(projectPath: string, slug: string): string[] {
    const out: string[] = [];
    // Pre-refactor: items lived in `tracker/{backlog,implementation}/<slug>/`.
    for (const bucket of ['backlog', 'implementation'] as TrackerBucket[]) {
      const dir = path.join(this.getBucketPath(projectPath, bucket), slug);
      if (fs.existsSync(dir)) out.push(dir);
    }
    return out;
  }

  readRequirementsPreview(item: TrackerItem, maxLines = 8): string[] {
    const body = item.requirementsBody.trim();
    if (!body) return [];
    return body
      .split('\n')
      .map(line => line.trimEnd())
      .filter((line, index, arr) => !(line === '' && arr[index - 1] === ''))
      .slice(0, maxLines);
  }

  private loadItems(project: string, projectPath: string, stageBySlug: Map<string, TrackerStage>): TrackerItem[] {
    const items: TrackerItem[] = [];
    const seen = new Set<string>();
    for (const [slug, stage] of stageBySlug.entries()) {
      if (seen.has(slug)) continue;
      const item = this.readItem(project, projectPath, this.bucketForStage(stage), stage, slug);
      if (item) {
        items.push(item);
        seen.add(slug);
      }
    }
    return items;
  }

  private readItem(
    project: string,
    projectPath: string,
    bucket: TrackerBucket,
    stage: TrackerStage,
    slug: string
  ): TrackerItem | null {
    // Item content lives in the worktree at `<wt>/tracker/items/<slug>/`. Archived
    // items live in the main project at `<projectPath>/tracker/archive/<slug>/`. We
    // delegate to resolveItemDir which also handles legacy layouts. Items without any
    // files yet are still surfaced so the kanban can show them; their fields just point
    // to where files *will* live (the worktree dir, or the archive dir if archived).
    const worktreePath = this.getWorktreePathForSlug(projectPath, slug);
    const defaultDir = bucket === 'archive'
      ? this.getArchiveItemDir(projectPath, slug)
      : this.getItemDirInWorktree(projectPath, slug);
    const itemDir = this.resolveItemDir(projectPath, slug) ?? defaultDir;

    const requirementsPath = path.join(itemDir, 'requirements.md');
    let frontmatter: TrackerFrontmatter = {};
    let body = '';
    if (fs.existsSync(requirementsPath)) {
      const parsed = parseFrontmatter(fs.readFileSync(requirementsPath, 'utf8'));
      frontmatter = parsed.frontmatter;
      body = parsed.body;
    }
    const resolvedSlug = frontmatter.slug || slug;
    const title = frontmatter.title || firstNonEmptyLine(body) || resolvedSlug;
    const implementationPath = path.join(itemDir, 'implementation.md');
    const notesPath = path.join(itemDir, 'notes.md');
    return {
      slug: resolvedSlug,
      title,
      project,
      projectPath,
      bucket,
      stage,
      itemDir,
      requirementsPath,
      implementationPath,
      notesPath,
      requirementsBody: body,
      frontmatter,
      hasImplementationNotes: fs.existsSync(implementationPath),
      hasNotes: fs.existsSync(notesPath),
      worktreePath,
      worktreeExists: fs.existsSync(worktreePath),
    };
  }

  private readIndex(projectPath: string): TrackerIndex {
    const indexPath = this.getIndexPath(projectPath);
    try {
      const raw = fs.readFileSync(indexPath, 'utf8');
      const parsed = JSON.parse(raw) as TrackerIndex;
      return {
        backlog: {
          backlog: parsed.backlog?.backlog || [],
          discovery: parsed.backlog?.discovery || [],
          requirements: parsed.backlog?.requirements || [],
        },
        implementation: {
          implement: parsed.implementation?.implement || [],
          cleanup: parsed.implementation?.cleanup || [],
        },
        archive: parsed.archive || [],
        sessions: parsed.sessions,
      };
    } catch {
      return {
        backlog: {backlog: [], discovery: [], requirements: []},
        implementation: {implement: [], cleanup: []},
        archive: [],
      };
    }
  }

  private bucketForStage(stage: TrackerStage): TrackerBucket {
    if (stage === 'archive') return 'archive';
    if (stage === 'implement' || stage === 'cleanup') return 'implementation';
    return 'backlog';
  }

  private removeSlugFromIndexObj(index: TrackerIndex, slug: string): void {
    for (const stage of BACKLOG_STAGES) {
      const arr = index.backlog?.[stage];
      if (arr) {
        const i = arr.indexOf(slug);
        if (i !== -1) arr.splice(i, 1);
      }
    }
    for (const stage of IMPLEMENTATION_STAGES) {
      const arr = index.implementation?.[stage];
      if (arr) {
        const i = arr.indexOf(slug);
        if (i !== -1) arr.splice(i, 1);
      }
    }
    if (index.archive) {
      const i = index.archive.indexOf(slug);
      if (i !== -1) index.archive.splice(i, 1);
    }
  }

  private addSlugToIndexObj(index: TrackerIndex, slug: string, stage: TrackerStage): void {
    if (stage === 'backlog' || stage === 'discovery' || stage === 'requirements') {
      if (!index.backlog) index.backlog = {};
      if (!index.backlog[stage]) index.backlog[stage] = [];
      index.backlog[stage]!.push(slug);
    } else if (stage === 'implement' || stage === 'cleanup') {
      if (!index.implementation) index.implementation = {};
      if (!index.implementation[stage]) index.implementation[stage] = [];
      index.implementation[stage]!.push(slug);
    } else {
      if (!index.archive) index.archive = [];
      index.archive.push(slug);
    }
  }

  private createStageBySlug(index: TrackerIndex): Map<string, TrackerStage> {
    const stages = new Map<string, TrackerStage>();
    for (const stage of BACKLOG_STAGES) {
      for (const slug of index.backlog?.[stage] || []) stages.set(slug, stage);
    }
    for (const stage of IMPLEMENTATION_STAGES) {
      for (const slug of index.implementation?.[stage] || []) stages.set(slug, stage);
    }
    for (const slug of index.archive || []) stages.set(slug, 'archive');
    return stages;
  }

  getWorkStylePath(projectPath: string): string {
    return path.join(this.getTrackerPath(projectPath), 'work-style.json');
  }

  getWorkStyleFilePath(projectPath: string): string {
    return path.join(this.getStagesDir(projectPath), 'working-style.md');
  }

  private generateWorkStyleFileContent(workStyle: WorkStyle): string {
    const DECISION_LABELS: Record<string, [string, string]> = {
      ask: ['Always ask me', 'Stop and ask before any non-trivial decision. Do not proceed without input.'],
      recommend: ['Research & recommend', 'Research first, present a recommendation with brief reasoning. Ask only for high-stakes decisions.'],
      decide: ['Decide autonomously', 'Make decisions based on best practices. Flag only decisions that fundamentally change scope.'],
    };
    const VERBOSITY_LABELS: Record<string, [string, string]> = {
      brief: ['Brief', 'Be brief and concise. Skip preamble. Get to the point immediately.'],
      detailed: ['Detailed', 'Be thorough. Explain your reasoning and walk through your thinking.'],
    };
    const PLANNING_LABELS: Record<string, [string, string]> = {
      dive_in: ['Dive in', 'Start working immediately. No upfront plan needed unless the task is genuinely complex.'],
      plan_first: ['Show plan first', 'Always present a plan of what you will do before starting work.'],
      plan_approval: ['Plan + approval', 'Present a plan and wait for explicit approval before proceeding.'],
    };
    const QUESTIONS_LABELS: Record<string, [string, string]> = {
      minimal: ['Minimal', 'Minimise questions. Infer intent and make reasonable assumptions. Only ask when truly blocked.'],
      batch: ['Batch together', 'When you have multiple questions, ask them all in one message.'],
      one_at_a_time: ['One at a time', 'Ask one question at a time, wait for the answer before asking the next.'],
    };
    const RESEARCH_LABELS: Record<string, [string, string]> = {
      light: ['Light', 'Read only what is directly relevant to the task. Minimal upfront research.'],
      moderate: ['Moderate', 'Read relevant files and a few related ones for context before acting.'],
      deep: ['Deep', 'Explore the codebase broadly, read related files, and understand the full picture before acting.'],
    };
    const SCOPE_LABELS: Record<string, [string, string]> = {
      minimal: ['Minimal', 'Change only what is necessary. Avoid scope creep and opportunistic cleanup.'],
      clean_as_go: ['Clean as you go', 'Fix small nearby issues when you encounter them, but stay close to the task.'],
      thorough: ['Thorough', 'Improve code quality proactively — refactor, clean up patterns, improve structure when relevant.'],
    };
    const TESTS_LABELS: Record<string, [string, string]> = {
      skip: ['Skip', 'Do not write tests unless explicitly asked.'],
      suggest: ['Suggest', 'Recommend tests where valuable, but do not write them unless asked.'],
      always: ['Always write', 'Write tests for every meaningful change. Tests are required.'],
    };
    const COMMITS_LABELS: Record<string, [string, string]> = {
      never: ['Never', 'Do not commit. The user handles commits.'],
      milestones: ['At milestones', 'Commit when a coherent chunk of work is complete.'],
      often: ['Frequently', 'Commit frequently with small focused commits after each meaningful change.'],
    };
    const BLOCKERS_LABELS: Record<string, [string, string]> = {
      ask: ['Stop & ask', 'When blocked, stop and ask the user how to proceed.'],
      try_first: ['Try alternatives first', 'Try reasonable alternatives before asking. Ask only if exhausted.'],
      continue: ['Note & continue', 'Note the issue clearly and continue with the rest of the work.'],
    };

    const row = (label: string, map: Record<string, [string, string]>, val: string) => {
      const [name, desc] = map[val] ?? [val, ''];
      return `**${label}:** ${name}\n${desc}`;
    };

    const custom = workStyle.customInstructions.trim()
      ? `\n## Custom Instructions\n\n${workStyle.customInstructions.trim()}\n`
      : '';

    return `# Working Style

> Auto-generated from \`tracker/work-style.json\`. Edit via the Style tab in the devteam stage configuration.

${row('Decisions', DECISION_LABELS, workStyle.decisionStyle)}

${row('Verbosity', VERBOSITY_LABELS, workStyle.verbosity)}

${row('Before starting', PLANNING_LABELS, workStyle.planning)}

${row('Questions', QUESTIONS_LABELS, workStyle.questions)}

${row('Research depth', RESEARCH_LABELS, workStyle.contextDepth)}

${row('Code scope', SCOPE_LABELS, workStyle.codeScope)}

${row('Tests', TESTS_LABELS, workStyle.testing)}

${row('Commits', COMMITS_LABELS, workStyle.commits)}

${row('On blockers', BLOCKERS_LABELS, workStyle.onBlockers)}

Use the ask_questions tool (or equivalent) when you need to ask the user questions, rather than asking inline.
${custom}`;
  }

  writeWorkStyleFile(projectPath: string, workStyle: WorkStyle): void {
    const dir = this.getStagesDir(projectPath);
    if (!fs.existsSync(dir)) return; // stages dir not initialised yet — skip
    fs.writeFileSync(this.getWorkStyleFilePath(projectPath), this.generateWorkStyleFileContent(workStyle), 'utf8');
  }

  loadWorkStyle(projectPath: string): WorkStyle {
    const p = this.getWorkStylePath(projectPath);
    if (!fs.existsSync(p)) return {...DEFAULT_WORK_STYLE};
    try {
      return {...DEFAULT_WORK_STYLE, ...JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<WorkStyle>};
    } catch {
      return {...DEFAULT_WORK_STYLE};
    }
  }

  saveWorkStyle(projectPath: string, workStyle: WorkStyle): void {
    this.ensureTracker(projectPath);
    writeJSONAtomic(this.getWorkStylePath(projectPath), workStyle);
    this.writeWorkStyleFile(projectPath, workStyle);
  }

  async editWorkStyleWithAI(projectPath: string, userPrompt: string): Promise<{success: boolean; workStyle?: WorkStyle; error?: string}> {
    const current = this.loadWorkStyle(projectPath);
    const prompt = `You are editing the work style configuration for a project tracker. This is a freeform instruction block that gets included in every agent prompt to shape how the agent behaves.

Current work style custom instructions:
"""
${current.customInstructions || '(empty)'}
"""

User request: ${userPrompt}

Return ONLY the updated customInstructions string as a JSON object: {"customInstructions": "..."}
No markdown, no code fences, no extra keys.`;

    const result = await runClaudeAsync(prompt, {cwd: projectPath, timeoutMs: 60000});
    if (!result.success) return {success: false, error: result.error || 'Claude failed'};
    const json = extractJsonObject(result.output);
    if (!json) return {success: false, error: 'No JSON in response'};
    try {
      const parsed = JSON.parse(json) as {customInstructions?: string};
      const updated: WorkStyle = {...current, customInstructions: parsed.customInstructions ?? current.customInstructions};
      this.saveWorkStyle(projectPath, updated);
      return {success: true, workStyle: updated};
    } catch {
      return {success: false, error: 'Failed to parse AI response'};
    }
  }

  buildPlanningPrompt(item: TrackerItem, stageConf: StageConfig, itemDirOverride?: string): string {
    if (item.stage === 'archive') return '';
    const stage = item.stage as Exclude<TrackerStage, 'archive'>;
    this.ensureStageFiles(item.projectPath);

    const stageLabel = STAGE_LABELS[stage];

    // The agent's cwd will be the worktree root (or the project root if no override).
    // Express every path relative to that cwd — the user wants no absolute paths in prompts.
    const itemDir = itemDirOverride ?? item.itemDir;
    const cwd = itemDirOverride
      ? path.resolve(itemDir, '..', '..', '..')  // worktree root: <wt>/tracker/items/<slug>/ → <wt>
      : item.projectPath;
    const rel = (p: string) => {
      const r = path.relative(cwd, p);
      return r === '' ? '.' : r;
    };

    const requirementsPath = itemDirOverride ? path.join(itemDir, 'requirements.md') : item.requirementsPath;
    const notesPath = path.join(itemDir, 'notes.md');
    const implementationPath = path.join(itemDir, 'implementation.md');
    const hasNotes = itemDirOverride ? fs.existsSync(notesPath) : item.hasNotes;
    const hasImpl = itemDirOverride ? fs.existsSync(implementationPath) : item.hasImplementationNotes;

    const workflowPath = path.join(this.getTrackerPath(item.projectPath), 'WORKFLOW.md');
    const workflowExists = fs.existsSync(workflowPath);
    const stageFilePath = this.getStageFilePath(item.projectPath, stage);
    const overviewPath = this.getOverviewFilePath(item.projectPath);

    const indexPath = this.getIndexPath(item.projectPath);
    const fileLines = [
      `  requirements.md     ${rel(requirementsPath)}`,
      `  notes.md            ${rel(notesPath)}${hasNotes ? '' : '  (not yet written)'}`,
      `  implementation.md   ${rel(implementationPath)}${hasImpl ? '' : '  (not yet written)'}`,
      `  tracker/index.json  ${rel(indexPath)}`,
    ];

    const workStyleFilePath = this.getWorkStyleFilePath(item.projectPath);

    const guideLines = [
      `  Stage:         ${rel(stageFilePath)}`,
      `  Overview:      ${rel(overviewPath)}`,
      `  Working style: ${rel(workStyleFilePath)}`,
      ...(workflowExists ? [`  Workflow:      ${rel(workflowPath)}`] : []),
    ];

    const settings = stageConf.settings || {};
    const settingsStr = Object.entries(settings).map(([k, v]) => `${k}=${v}`).join('  ');

    return `Item: ${item.slug} ("${item.title}")
Stage: ${stageLabel}
Item dir: ${rel(itemDir)}

All paths below are relative to your current working directory (the repo root).

Files:
${fileLines.join('\n')}

Guides:
${guideLines.join('\n')}
${settingsStr ? `\nStage settings: ${settingsStr}` : ''}
Use ask_questions tool when you need to ask the user. Read the stage guide and get started.`;
  }

  evaluateExitCriteria(item: TrackerItem, criteria: ExitCriterion[]): ExitCriterionResult[] {
    return criteria.map(criterion => {
      let met = false;
      switch (criterion.check) {
        case 'requirements_has_body':
          met = item.requirementsBody.trim().length > 0;
          break;
        case 'requirements_min_50_words':
          met = item.requirementsBody.trim().split(/\s+/).filter(Boolean).length >= 50;
          break;
        case 'has_implementation_notes':
          met = item.hasImplementationNotes;
          break;
        case 'has_notes':
          met = item.hasNotes;
          break;
        case 'worktree_exists':
          met = item.worktreeExists;
          break;
      }
      return {criterion, met};
    });
  }

  getStagesConfigPath(projectPath: string): string {
    return path.join(this.getTrackerPath(projectPath), 'stages.json');
  }

  loadStagesConfig(projectPath: string): Required<StagesConfig> {
    const configPath = this.getStagesConfigPath(projectPath);
    if (!fs.existsSync(configPath)) return {...DEFAULT_STAGES_CONFIG};
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as StagesConfig;
      const merged: Required<StagesConfig> = {...DEFAULT_STAGES_CONFIG};
      for (const stage of Object.keys(DEFAULT_STAGES_CONFIG) as Exclude<TrackerStage, 'archive'>[]) {
        if (raw[stage]) {
          merged[stage] = {
            ...DEFAULT_STAGES_CONFIG[stage],
            ...raw[stage],
            // Always keep exitCriteria from defaults unless explicitly overridden
            exitCriteria: raw[stage].exitCriteria ?? DEFAULT_STAGES_CONFIG[stage].exitCriteria,
          };
        }
      }
      return merged;
    } catch {
      return {...DEFAULT_STAGES_CONFIG};
    }
  }

  saveStagesConfig(projectPath: string, config: StagesConfig): void {
    this.ensureTracker(projectPath);
    writeJSONAtomic(this.getStagesConfigPath(projectPath), config);
  }

  saveStageSettings(projectPath: string, stage: Exclude<TrackerStage, 'archive'>, settings: Record<string, string>): void {
    const config = this.loadStagesConfig(projectPath);
    config[stage] = {...config[stage], settings: {...(config[stage].settings || {}), ...settings}};
    this.saveStagesConfig(projectPath, config);
  }

  // ── Stage instruction files ──────────────────────────────────────────────

  private readonly STAGE_FILE_NUMBERS: Record<Exclude<TrackerStage, 'archive'>, number> = {
    backlog: 1, discovery: 2, requirements: 3, implement: 4, cleanup: 5,
  };

  getStagesDir(projectPath: string): string {
    return path.join(this.getTrackerPath(projectPath), 'stages');
  }

  getStageFilePath(projectPath: string, stage: Exclude<TrackerStage, 'archive'>): string {
    const n = this.STAGE_FILE_NUMBERS[stage];
    return path.join(this.getStagesDir(projectPath), `${n}-${stage}.md`);
  }

  getOverviewFilePath(projectPath: string): string {
    return path.join(this.getStagesDir(projectPath), '0-overview.md');
  }

  readStageFile(projectPath: string, stage: Exclude<TrackerStage, 'archive'>): string {
    const p = this.getStageFilePath(projectPath, stage);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }

  readOverviewFile(projectPath: string): string {
    const p = this.getOverviewFilePath(projectPath);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }

  private defaultOverviewFileContent(): string {
    return `# Tracker Overview

This project uses devteam's tracker to manage work items through a structured workflow.

## Stages

Items progress through these numbered stages:

1. **Backlog** (\`1-backlog.md\`) — Item created, not yet being worked on. Triage and describe.
2. **Discovery** (\`2-discovery.md\`) — Clarify the user problem and approach. Output: \`notes.md\`.
3. **Requirements** (\`3-requirements.md\`) — Document what to build. Output: \`requirements.md\`.
4. **Implement** (\`4-implement.md\`) — Build the feature. Output: code + \`implementation.md\`.
5. **Cleanup** (\`5-cleanup.md\`) — Polish, review, and ship.

## Item Files

Each item lives in a directory under the tracker:
- Active items: \`tracker/items/<slug>/\` (inside the item's worktree)
- Archived: \`tracker/archive/<slug>/\` (in the main project)

Key files per item:
- \`requirements.md\` — always present (stub initially, filled in stage 3)
- \`notes.md\` — discovery output (written in stage 2)
- \`implementation.md\` — implementation notes (written in stage 4)

## Advancing a Stage

When you complete a stage, update the \`tracker/index.json\` listed in the prompt (use the relative path shown there) to move the item to the next stage, then read the next stage file and continue working autonomously.

The index structure:
\`\`\`json
{
  "backlog": {
    "backlog": ["slug-a"],
    "discovery": ["slug-b"],
    "requirements": ["slug-c"]
  },
  "implementation": {
    "implement": ["slug-d"],
    "cleanup": ["slug-e"]
  },
  "archive": ["slug-f"]
}
\`\`\`

To advance: find the slug in its current array, remove it, add it to the next stage's array, write the file back. Then continue with the next stage.

## Working Style

Read \`tracker/stages/working-style.md\` for the project's preferred working style. Honour it throughout all stages.
`;
  }

  defaultStageFileContent(stage: Exclude<TrackerStage, 'archive'>, settings?: Record<string, string>): string {
    const n = this.STAGE_FILE_NUMBERS[stage];
    const s = settings || {};
    const numbered = (items: (string | null)[]): string =>
      items.filter((x): x is string => !!x).map((x, i) => `${i + 1}. ${x}`).join('\n');

    switch (stage) {
      case 'backlog': {
        const effortEstimate = s['effort_estimate'] ?? 'rough';
        const autoDiscover = s['auto_discover'] ?? 'prompt';

        const effortStep =
          effortEstimate === 'skip' ? null
          : effortEstimate === 'detailed'
            ? 'Assess effort: estimate story points or days, identify blockers and risks. Note this in `requirements.md`.'
            : 'Assess rough effort and value — a t-shirt size (S/M/L/XL) is enough. Note it in `requirements.md`.';

        const afterStep =
          autoDiscover === 'auto'
            ? 'Advance to discovery automatically — no need to prompt the user.'
            : autoDiscover === 'manual'
            ? 'Stop here. The user will manually trigger the next stage.'
            : 'Use the ask_questions tool to ask: is this worth pursuing now, or should it stay in backlog?';

        return `# Stage ${n}: Backlog

**Goal**: Triage this item — clarify what it is, assess scope, decide whether to pursue.

## Steps

${numbered([
  'Read the item title. Is it clear and actionable? Rewrite it if not.',
  'Check the tracker for similar or duplicate items.',
  effortStep,
  'Write a short description of the item in `requirements.md` — what it is and why it matters. Not full requirements yet, just enough context to revisit later.',
  afterStep,
])}

## Output

`+"`"+`requirements.md`+"`"+` with a short description${effortEstimate !== 'skip' ? ' and effort estimate' : ''}.

## Advancing

When the user confirms pursuit: update the `+"`"+`tracker/index.json`+"`"+` (path is in the prompt, relative to cwd) to move the slug from `+"`"+`backlog.backlog`+"`"+` to `+"`"+`backlog.discovery`+"`"+`. Then read `+"`"+`tracker/stages/2-discovery.md`+"`"+` and continue.
`;
      }

      case 'discovery': {
        const depth = s['depth'] ?? 'normal';
        const skip = s['skip'] ?? 'if_obvious';
        const webSearch = s['web_search'] ?? 'if_needed';
        const questions = s['questions'] ?? 'standard';

        if (skip === 'always_skip') {
          return `# Stage ${n}: Discovery

**Mode: always skip** — Write a minimal `+"`"+`notes.md`+"`"+` and advance immediately. No investigation needed.

## Steps

${numbered([
  'Infer the user problem from the item title and `requirements.md`.',
  'Write a brief `notes.md` (3–5 sentences: problem, assumption, recommendation).',
  'Advance: update the `tracker/index.json` (path is in the prompt, relative to cwd) slug to `backlog.requirements`. Read `tracker/stages/3-requirements.md` and continue.',
])}
`;
        }

        const skipClause = skip === 'if_obvious'
          ? '\n> **If obvious**: if the problem and approach are already clear from the title and context, write a minimal `notes.md` and advance without full investigation.\n'
          : '';

        const steps: (string | null)[] = [];
        steps.push('Read the item title and `requirements.md` stub. What is the actual user problem?');

        if (depth === 'quick') {
          if (webSearch === 'always') steps.push('Do a quick web search for relevant context or prior art.');
          if (questions === 'standard') steps.push('Use the ask_questions tool to ask **1 focused question** if anything is ambiguous.');
          else if (questions === 'minimal') steps.push('Use the ask_questions tool if anything critical is unclear — one question max.');
          steps.push('Write findings to `notes.md` (user problem + recommendation). Keep it brief.');
        } else if (depth === 'thorough') {
          steps.push('Scan the codebase: relevant patterns, existing solutions, potential conflicts, test coverage.');
          if (webSearch !== 'never') steps.push('Do a web search: domain knowledge, external APIs/libraries, prior art, competing approaches.');
          if (questions === 'none') {
            steps.push('Write comprehensive findings to `notes.md` based on research alone — no Q&A.');
          } else {
            const qCount = questions === 'minimal' ? '2–3' : '3–5';
            steps.push(`Use the ask_questions tool to ask **${qCount} focused questions** about the problem and approach before concluding.`);
            steps.push('Write comprehensive findings to `notes.md`.');
          }
        } else { // normal
          steps.push('Quick codebase scan: existing patterns, related code, similar solutions.');
          if (webSearch === 'never') {
            // no web search step
          } else if (webSearch === 'always') {
            steps.push('Do a web search to understand the domain and any relevant tools or APIs.');
          } else {
            steps.push('If the domain is unfamiliar or involves external APIs, do a brief web search.');
          }
          if (questions === 'none') {
            steps.push('Write findings to `notes.md` based on research — no Q&A.');
          } else {
            const qCount = questions === 'minimal' ? '1 focused question' : '1–3 focused questions';
            steps.push(`Use the ask_questions tool to ask **${qCount}** — focus on "why" and "what to build", not "how".`);
            steps.push('Write findings to `notes.md`.');
          }
        }

        const outputFields =
          depth === 'quick'
            ? '- **User problem**: who has this problem and what is the pain\n- **Recommendation**: proposed approach'
            : depth === 'thorough'
            ? '- **User problem**: who has this problem and what is the pain\n- **Context**: codebase findings and research\n- **Options considered**: 2+ approaches with tradeoffs\n- **Recommendation**: proposed approach with reasoning and known risks'
            : '- **User problem**: who has this problem and what is the pain\n- **Findings**: relevant codebase or research findings\n- **Recommendation**: proposed approach with brief reasoning';

        return `# Stage ${n}: Discovery
${skipClause}
**Goal**: Clarify what user problem this item solves and whether the approach makes sense.

## Steps

${numbered(steps)}

## Output

Write to `+"`"+`notes.md`+"`"+`:
${outputFields}

Keep the body of `+"`"+`requirements.md`+"`"+` untouched during discovery — that belongs to stage 3.

## Advancing

When `+"`"+`notes.md`+"`"+` is written, append a single line like \`## Requirements (stub)\` to `+"`"+`requirements.md`+"`"+` as the "discovery done" signal. The board auto-detects this heading and advances the item to the requirements stage. Then read `+"`"+`tracker/stages/3-requirements.md`+"`"+` and continue.
`;
      }

      case 'requirements': {
        const style = s['style'] ?? 'interview';
        const detail = s['detail'] ?? 'standard';
        const approval = s['approval'] ?? 'per_section';
        const userStories = s['user_stories'] ?? 'skip';

        const steps: (string | null)[] = [];
        steps.push('Read `notes.md` (discovery output) and the existing `requirements.md` — note the discovery stub heading and anything already written.');
        steps.push('**Preserve the what / why from discovery.** The "Problem" and "Why" sections come straight from `notes.md` — copy them into `requirements.md` verbatim or lightly edited. Do not delete, paraphrase away, or weaken that context when adding new sections.');

        if (style === 'interview') {
          steps.push(`Use the ask_questions tool to ask targeted questions about acceptance criteria, edge cases, and constraints.${approval !== 'none' ? ' Batch questions — don\'t ask one at a time.' : ''}`);
          steps.push('Draft the remaining requirements sections based on the answers, **appending** to the preserved discovery context rather than replacing it.');
          if (approval === 'per_section') steps.push('Walk through each new section with the user for approval before moving to the next.');
          else if (approval === 'end_only') steps.push('Draft all new sections, then present the complete document for user review.');
          steps.push('Write the final `requirements.md` — it must still open with the discovery "Problem" and "Why" content, followed by the new sections.');
        } else if (style === 'draft_first') {
          steps.push('Draft a strawman `requirements.md` based on `notes.md` and your understanding — write it before asking anything. **Start with "Problem" and "Why" copied from `notes.md`**, then append your draft of the remaining sections.');
          if (approval === 'per_section') steps.push('Walk through each section with the user. Use the ask_questions tool for feedback and corrections.');
          else if (approval === 'end_only') steps.push('Share the complete draft. Use the ask_questions tool to collect corrections and open questions.');
          else steps.push('Share the draft and incorporate any feedback the user volunteers.');
          steps.push('Revise and write the final `requirements.md` — the "Problem" and "Why" from discovery must remain intact at the top.');
        } else { // freeform
          steps.push('Ask the user how they want to proceed — let them guide the format and depth.');
          steps.push('Use the ask_questions tool as needed throughout the conversation.');
          steps.push('Write `requirements.md` in whatever format fits the item — but always retain the "Problem" / "Why" context surfaced by discovery.');
        }

        const outputSections: string[] = [];
        outputSections.push('- **Problem** (from discovery): the user problem this solves — preserved from `notes.md`');
        outputSections.push('- **Why** (from discovery): context / motivation / findings — preserved from `notes.md`');
        if (userStories === 'lead') outputSections.push('- **User stories** (lead): as a [user], I want [feature] so that [benefit]');
        outputSections.push('- **Summary**: one-paragraph summary of what is being built');
        if (userStories === 'include') outputSections.push('- **User stories**: as a [user], I want [feature] so that [benefit]');
        outputSections.push('- **Acceptance criteria**: numbered list of testable conditions');
        if (detail !== 'minimal') outputSections.push('- **Edge cases**: important boundary conditions');
        if (detail === 'thorough') {
          outputSections.push('- **Constraints**: technical, performance, security, or UX constraints');
          outputSections.push('- **Dependencies**: other items or systems this depends on');
          outputSections.push('- **Out of scope**: explicitly what is NOT being built');
        }

        const minWords = detail === 'minimal' ? 30 : detail === 'thorough' ? 100 : 50;

        return `# Stage ${n}: Requirements

**Goal**: Document what needs to be built — acceptance criteria, edge cases, constraints — **while preserving the what / why surfaced during discovery**.

## Steps

${numbered(steps)}

## Output

`+"`"+`requirements.md`+"`"+` must contain, in this order:
${outputSections.join('\n')}

The **Problem** and **Why** sections are copied forward from `+"`"+`notes.md`+"`"+` — do not drop or substantially rewrite them. Reviewers should be able to see the original motivation without going back to `+"`"+`notes.md`+"`"+`.

Minimum ${minWords} words of real content.

## Advancing

When `+"`"+`requirements.md`+"`"+` has sufficient detail: update the `+"`"+`tracker/index.json`+"`"+` (path is in the prompt, relative to cwd) slug to `+"`"+`implementation.implement`+"`"+`. Read `+"`"+`tracker/stages/4-implement.md`+"`"+` and continue.
`;
      }

      case 'implement': {
        const tdd = s['tdd'] ?? 'suggested';
        const startWith = s['start_with'] ?? 'explore';
        const commitStyle = s['commit_style'] ?? 'per_feature';
        const implNotes = s['impl_notes'] ?? 'brief';

        const commitInstruction =
          commitStyle === 'none' ? null
          : commitStyle === 'atomic' ? 'Commit frequently — one logical change per commit. Small, reviewable units.'
          : commitStyle === 'conventional' ? 'Commit using conventional format: `feat:`, `fix:`, `refactor:`, `test:`, etc. One logical change per commit.'
          : 'Commit when each logical feature or fix is complete.';

        const tddInstruction =
          tdd === 'required' ? 'Write failing tests **before** any production code. No production code without a failing test first.'
          : tdd === 'skip' ? 'Do not write tests unless explicitly asked.'
          : 'Write tests when natural — alongside the code or after. Recommend tests for non-trivial logic.';

        const steps: (string | null)[] = [];
        steps.push('Read `requirements.md` and `notes.md`.');

        if (startWith === 'explore') {
          steps.push('Explore the codebase: find existing patterns, test setup, conventions, and where this feature fits.');
          steps.push('Use the ask_questions tool to ask 2–3 key questions about approach and design decisions before starting.');
          steps.push(tddInstruction);
          steps.push('Build the feature.');
          if (commitInstruction) steps.push(commitInstruction);
          if (implNotes === 'brief') steps.push('Write brief implementation notes to `implementation.md`: what was built, key decisions, anything cleanup should know.');
          else if (implNotes === 'detailed') steps.push('Write detailed implementation notes to `implementation.md`: what was built, all key decisions and their rationale, architecture notes, known issues, notes for cleanup.');
        } else { // jump_in
          steps.push('Use the ask_questions tool to ask 1–2 questions if anything critical is unclear — then start coding.');
          steps.push(tddInstruction);
          steps.push('Build the feature.');
          if (commitInstruction) steps.push(commitInstruction);
          if (implNotes === 'brief') steps.push('Write brief implementation notes to `implementation.md`.');
          else if (implNotes === 'detailed') steps.push('Write detailed implementation notes to `implementation.md`: decisions, rationale, known issues.');
        }

        const outputLines = ['- Working code committed to the repo'];
        if (implNotes === 'brief') outputLines.push('- `implementation.md`: what was built, key decisions, notes for cleanup');
        else if (implNotes === 'detailed') outputLines.push('- `implementation.md`: full implementation journal — decisions, rationale, architecture, known issues');

        return `# Stage ${n}: Implement

**Goal**: Build the feature according to the requirements.

## Steps

${numbered(steps)}

## Output

${outputLines.join('\n')}

## Advancing

When implementation is complete${tdd !== 'skip' ? ' and tests pass' : ''}: update the `+"`"+`tracker/index.json`+"`"+` (path is in the prompt, relative to cwd) slug to `+"`"+`implementation.cleanup`+"`"+`. Read `+"`"+`tracker/stages/5-cleanup.md`+"`"+` and continue.
`;
      }

      case 'cleanup': {
        const scope = s['scope'] ?? 'standard';
        const tests = s['tests'] ?? 'fix';
        const docs = s['docs'] ?? 'skip';
        const prPrep = s['pr_prep'] ?? 'skip';

        const steps: (string | null)[] = [];
        steps.push('Read `implementation.md` to understand what was built.');
        steps.push('Review the diff (`git diff main` or relevant branch).');

        if (scope === 'quick') {
          steps.push('Fix only critical issues: bugs, crashes, obvious mistakes. Do not refactor.');
        } else if (scope === 'thorough') {
          steps.push('Full review: naming, dead code, error handling, edge cases, code clarity.');
          steps.push('Refactor for clarity where warranted — this is the last chance before ship.');
        } else {
          steps.push('Standard pass: remove dead code, fix obvious naming issues, add missing error handling.');
        }

        if (tests === 'run') steps.push('Run the test suite. Note any failures but do not fix them.');
        else if (tests === 'fix') {
          if (scope === 'thorough') steps.push('Run the test suite. Fix all failures. Add tests for any uncovered edge cases.');
          else steps.push('Run the test suite. Fix any failures.');
        }

        if (docs === 'update') steps.push('Update existing docs to reflect what changed — README, inline docs, changelogs.');
        else if (docs === 'write') steps.push('Write new docs for any new APIs, flags, or behaviours introduced.');

        steps.push('Use the ask_questions tool for any remaining decisions or blockers.');

        if (prPrep === 'notes') steps.push('Jot down key changes and decisions for the PR description.');
        else if (prPrep === 'full') steps.push('Write a full PR description: summary, changes made, how to test, screenshots or logs if applicable.');

        return `# Stage ${n}: Cleanup

**Goal**: Polish and ship. Review what was built, catch issues, get it across the finish line.

## Steps

${numbered(steps)}

## Advancing

When cleanup is complete: update the `+"`"+`tracker/index.json`+"`"+` (path is in the prompt, relative to cwd) slug to `+"`"+`archive`+"`"+`. Item is done.
`;
      }
    }
  }

  ensureStageFiles(projectPath: string): void {
    const dir = this.getStagesDir(projectPath);
    ensureDirectory(dir);
    const overviewPath = this.getOverviewFilePath(projectPath);
    if (!fs.existsSync(overviewPath)) {
      fs.writeFileSync(overviewPath, this.defaultOverviewFileContent(), 'utf8');
    }
    for (const stage of (['discovery', 'requirements', 'implement', 'cleanup'] as const)) {
      const p = this.getStageFilePath(projectPath, stage);
      if (!fs.existsSync(p)) {
        fs.writeFileSync(p, this.defaultStageFileContent(stage), 'utf8');
      }
    }
    // Always regenerate working-style.md so it stays in sync with work-style.json
    this.writeWorkStyleFile(projectPath, this.loadWorkStyle(projectPath));
  }

  async editStageFileWithAI(projectPath: string, stage: Exclude<TrackerStage, 'archive'>, userPrompt: string): Promise<{success: boolean; error?: string}> {
    this.ensureStageFiles(projectPath);
    const filePath = this.getStageFilePath(projectPath, stage);
    const current = fs.readFileSync(filePath, 'utf8');
    const prompt = `You are editing a stage instruction file for a devteam tracker. This markdown file tells the AI agent what to do when working on items in this stage.

Current file content:
${current}

User request: ${userPrompt}

Return ONLY the updated file content as plain markdown. No explanation, no code fences.`;
    const result = await runClaudeAsync(prompt, {cwd: projectPath, timeoutMs: 60000});
    if (!result.success) return {success: false, error: result.error || 'Claude failed'};
    const updated = result.output.replace(/^```markdown\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    if (!updated) return {success: false, error: 'Empty response from AI'};
    fs.writeFileSync(filePath, updated + '\n', 'utf8');
    return {success: true};
  }

  async editStagesConfigWithAI(projectPath: string, userPrompt: string): Promise<{success: boolean; config?: Required<StagesConfig>; error?: string}> {
    const current = this.loadStagesConfig(projectPath);
    const prompt = `You are editing stage configuration for a kanban tracker.

Current stages config (JSON):
${JSON.stringify(current, null, 2)}

User request: ${userPrompt}

Return ONLY the complete updated stages config as valid JSON with no markdown, no code fences, no explanation.
The JSON object must have these stage keys: backlog, discovery, requirements, implement, cleanup.
Each stage must have: actionLabel (string), description (string), checklist (string[]), agentPrompt (string).`;

    const result = await runClaudeAsync(prompt, {cwd: projectPath, timeoutMs: 90000});
    if (!result.success) return {success: false, error: result.error || 'Claude failed'};
    const json = extractJsonObject(result.output);
    if (!json) return {success: false, error: 'No JSON in response'};
    try {
      const parsed = JSON.parse(json) as StagesConfig;
      const merged: Required<StagesConfig> = {...DEFAULT_STAGES_CONFIG};
      for (const stage of Object.keys(DEFAULT_STAGES_CONFIG) as Exclude<TrackerStage, 'archive'>[]) {
        if (parsed[stage]) merged[stage] = {...DEFAULT_STAGES_CONFIG[stage], ...parsed[stage]};
      }
      this.saveStagesConfig(projectPath, merged);
      return {success: true, config: merged};
    } catch {
      return {success: false, error: 'Failed to parse AI response'};
    }
  }

  async generateProposals(project: string, projectPath: string, userPrompt?: string): Promise<{success: boolean; proposals?: ProposalCandidate[]; error?: string}> {
    this.ensureTracker(projectPath);
    const board = this.loadBoard(project, projectPath);
    const existingItems = board.columns.flatMap(col => col.items);

    const existingList = existingItems.length > 0
      ? existingItems.map(item => `- ${item.slug}: ${item.title}`).join('\n')
      : '(none yet)';

    const contextParts: string[] = [];
    for (const filename of ['CLAUDE.md', 'README.md', 'package.json']) {
      try {
        const filePath = path.join(projectPath, filename);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8').slice(0, 1500);
          contextParts.push(`${filename}:\n${content}`);
        }
      } catch {}
    }
    const contextFiles = contextParts.join('\n\n') || '(no context files found)';
    const focusLine = userPrompt?.trim()
      ? `\nFOCUS: ${userPrompt.trim()}\n`
      : '';

    const proposalsFile = this.getPendingProposalsPath(projectPath);
    // Clear any stale file from a previous run
    try { fs.unlinkSync(proposalsFile); } catch {}

    const prompt = `You are helping populate a project backlog tracker.

Project name: ${project}
${focusLine}
EXISTING ITEMS (do not duplicate these):
${existingList}

PROJECT CONTEXT:
${contextFiles}

Generate 4-8 candidate backlog items for this project.

IMPORTANT: Write the result as valid JSON to this exact file path:
  ${proposalsFile}

The JSON must be an array of objects with this shape:
[
  {
    "title": "Short descriptive title under 60 chars",
    "slug": "lowercase-slug-with-hyphens",
    "description": "One or two sentences describing the work."
  }
]

Rules:
- title: under 60 characters, descriptive
- slug: lowercase letters, digits, hyphens only, MAX 20 characters
- description: 1-2 sentences, concrete and actionable
- Do NOT include any item that already exists in the list above

After writing the file, also print the same JSON to stdout so the caller can read it either way.`;

    const result = await runClaudeAsync(prompt, {cwd: projectPath, timeoutMs: 600000});

    // Prefer the file (survives stdout truncation, agent chatter, timeouts)
    let proposals: ProposalCandidate[] = [];
    try {
      if (fs.existsSync(proposalsFile)) {
        proposals = this.parseProposalResponse(fs.readFileSync(proposalsFile, 'utf8'));
      }
    } catch {}
    if (proposals.length === 0) proposals = this.parseProposalResponse(result.output);

    if (proposals.length === 0) {
      return {success: false, error: result.success ? 'No proposals were generated' : (result.error || 'Claude failed')};
    }
    return {success: true, proposals};
  }

  hasTracker(projectPath: string): boolean {
    return fs.existsSync(this.getIndexPath(projectPath));
  }

  countItems(projectPath: string): {total: number; backlog: number; implementation: number} {
    if (!this.hasTracker(projectPath)) return {total: 0, backlog: 0, implementation: 0};
    try {
      const raw = JSON.parse(fs.readFileSync(this.getIndexPath(projectPath), 'utf8')) as TrackerIndex;
      const backlog = (raw.backlog?.backlog?.length ?? 0) + (raw.backlog?.discovery?.length ?? 0) + (raw.backlog?.requirements?.length ?? 0);
      const implementation = (raw.implementation?.implement?.length ?? 0) + (raw.implementation?.cleanup?.length ?? 0);
      return {total: backlog + implementation, backlog, implementation};
    } catch {
      return {total: 0, backlog: 0, implementation: 0};
    }
  }

  getPendingProposalsPath(projectPath: string): string {
    return path.join(this.getTrackerPath(projectPath), '.proposals.json');
  }

  loadPendingProposals(projectPath: string): ProposalCandidate[] | null {
    const file = this.getPendingProposalsPath(projectPath);
    if (!fs.existsSync(file)) return null;
    try {
      const proposals = this.parseProposalResponse(fs.readFileSync(file, 'utf8'));
      return proposals.length > 0 ? proposals : null;
    } catch { return null; }
  }

  clearPendingProposals(projectPath: string): void {
    try { fs.unlinkSync(this.getPendingProposalsPath(projectPath)); } catch {}
  }

  private parseProposalResponse(output: string): ProposalCandidate[] {
    try {
      const cleaned = output.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (start === -1 || end === -1) return [];
      const raw = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
      return raw
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map(item => ({
          title: String(item['title'] || '').slice(0, 80),
          slug: String(item['slug'] || this.slugify(String(item['title'] || ''))).slice(0, 20),
          description: String(item['description'] || ''),
        }))
        .filter(item => item.title && item.slug);
    } catch {
      return [];
    }
  }
}

export function parseFrontmatter(content: string): {frontmatter: TrackerFrontmatter; body: string} {
  if (!content.startsWith('---\n')) {
    return {frontmatter: {}, body: content};
  }
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return {frontmatter: {}, body: content};
  const rawFrontmatter = content.slice(4, end);
  const body = content.slice(end + 5);
  const frontmatter: TrackerFrontmatter = {};
  for (const line of rawFrontmatter.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    frontmatter[key] = stripMatchingQuotes(value);
  }
  return {frontmatter, body};
}

function stripMatchingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('\'') && value.endsWith('\''))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function firstNonEmptyLine(body: string): string | undefined {
  return body.split('\n').map(line => line.trim()).find(Boolean);
}
