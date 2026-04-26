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

// Agent-reported live state for an item. Written by the agent at every
// meaningful transition (stage start/advance, pause, resume). Ralph reads this
// to decide whether an idle pane is truly stuck or legitimately waiting.
export interface ItemStatus {
  stage: Exclude<TrackerStage, 'archive'>;
  // Ralph treats both waiting states the same (suppress nudges); the kanban
  // renders waiting_for_approval distinctly so "ready to advance" is
  // spottable at a glance.
  state: ItemStatusState;
  // Short human-readable note: what the agent is currently doing, or the
  // concrete thing it's waiting on. ≤ 200 chars.
  brief_description: string;
  // ISO-8601 timestamp of last update. Used for the staleness check.
  timestamp: string;
}

export type ItemStatusState = 'working' | 'waiting_for_input' | 'waiting_for_approval';

// Coerce a freshly-parsed status.json payload to a valid state. Accepts the
// new `state` enum and the legacy `is_waiting_for_user` / `awaiting_advance_approval`
// booleans so existing files on disk keep working. Returns null when the
// payload isn't recognisable as a status record.
function normaliseItemState(parsed: Record<string, unknown>): ItemStatusState | null {
  const raw = parsed.state;
  if (raw === 'working' || raw === 'waiting_for_input' || raw === 'waiting_for_approval') return raw;
  if (typeof raw === 'string') return null; // unknown value — treat as malformed
  const approval = parsed.awaiting_advance_approval === true;
  const input = parsed.is_waiting_for_user === true;
  if (approval) return 'waiting_for_approval';
  if (input) return 'waiting_for_input';
  if (parsed.is_waiting_for_user === false) return 'working';
  return null; // no legacy boolean either — schema doesn't match
}

// Treat a waiting flag as stale (and ignore it) after this many ms. Guards
// against crashed agents that never cleared is_waiting_for_user.
export const ITEM_STATUS_STALE_MS = 24 * 60 * 60 * 1000;

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
export type BlockerStyle = 'ask' | 'try_first' | 'continue';
// How the agent should deliver questions/requests for review. Project-wide
// preference; drives the "Input mode" block in every generated stage guide.
export type InputModeStyle = 'ask_questions' | 'inline' | 'batch' | 'doc_review';

const TRACKER_SKILL_NAME = 'stages-progression';
export const TRACKER_SKILL_REL_PATH = `.agents/skills/${TRACKER_SKILL_NAME}/SKILL.md`;

export interface WorkStyle {
  decisionStyle: DecisionStyle;
  verbosity: VerbosityStyle;
  inputMode: InputModeStyle;
  customInstructions: string;
}

export const DEFAULT_WORK_STYLE: WorkStyle = {
  decisionStyle: 'recommend',
  verbosity: 'brief',
  inputMode: 'ask_questions',
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
    settings: {effort: 'standard', report: 'confirm_if_notable'},
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
    actionLabel: 'Move to cleanup and submit',
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
  sessions?: Record<string, {title?: string; inactive?: boolean}>;
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
  inactive: boolean;
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
  cleanup: 'Cleanup and submit',
  archive: 'Archive',
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
    const allItems = this.loadItems(project, projectPath, stageBySlug, index);
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
        title: STAGE_LABELS[id],
        bucket,
        items: this.sortItemsForBoard([...ordered, ...extras]),
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
    backlogDiscovery.items = this.sortItemsForBoard([...backlogDiscovery.items, ...discoveryExtras]);

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

  isItemInactive(projectPath: string, slug: string): boolean {
    return this.readIndex(projectPath).sessions?.[slug]?.inactive === true;
  }

  setItemInactive(projectPath: string, slug: string, inactive: boolean): boolean {
    return this._writeInactive(projectPath, this.readIndex(projectPath), slug, inactive);
  }

  toggleItemInactive(projectPath: string, slug: string): boolean {
    const index = this.readIndex(projectPath);
    const current = index.sessions?.[slug]?.inactive === true;
    return this._writeInactive(projectPath, index, slug, !current);
  }

  private _writeInactive(projectPath: string, index: TrackerIndex, slug: string, inactive: boolean): boolean {
    if (!this.createStageBySlug(index).has(slug)) return false;
    const sessions = {...(index.sessions ?? {})};
    const {inactive: _prev, ...rest} = sessions[slug] ?? {};
    sessions[slug] = inactive ? {...rest, inactive: true} : rest;
    index.sessions = sessions;
    writeJSONAtomic(this.getIndexPath(projectPath), index);
    return true;
  }

  slugify(title: string, maxLength = 20): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, maxLength);
  }

  private isValidSlug(slug: string): boolean {
    // Must start and end with alphanumeric; hyphens only in the middle.
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug);
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

  // Path to the agent's self-reported status file for an item. Lives alongside
  // the stage output files (notes.md, requirements.md, implementation.md).
  getItemStatusPath(projectPath: string, slug: string): string | null {
    const itemDir = this.resolveItemDir(projectPath, slug);
    if (!itemDir) return null;
    return path.join(itemDir, 'status.json');
  }

  // Read the agent's current status. Returns null when the file is absent or
  // malformed. Validates the schema loosely so a partial write doesn't explode
  // ralph's sampling loop.
  getItemStatus(projectPath: string, slug: string): ItemStatus | null {
    const statusPath = this.getItemStatusPath(projectPath, slug);
    if (!statusPath || !fs.existsSync(statusPath)) return null;
    const raw = readFileOrNull(statusPath);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed.stage !== 'string' || typeof parsed.timestamp !== 'string') return null;
      // Whitelist the stage string before using it anywhere that constructs
      // file paths (getStageFilePath) — otherwise a malicious or corrupted
      // status.json with `stage: "../../.ssh/id_rsa"` would flow through.
      if (!STAGE_ORDER.includes(parsed.stage as TrackerStage) || parsed.stage === 'archive') return null;
      // Accept both the new `state` enum and the legacy boolean schema so
      // existing status.json files on disk keep working.
      const state = normaliseItemState(parsed);
      if (!state) return null;
      return {
        stage: parsed.stage as Exclude<TrackerStage, 'archive'>,
        state,
        brief_description: typeof parsed.brief_description === 'string' ? parsed.brief_description : '',
        timestamp: parsed.timestamp,
      };
    } catch {
      return null;
    }
  }

  // Overwrite the status file. Writes to the resolved item dir, or (as a
  // fallback for items with no worktree yet) to the main-project stub dir so
  // the file still has a home. Truncates brief_description to 200 chars to
  // keep the UI row from growing without bound.
  writeItemStatus(projectPath: string, slug: string, status: ItemStatus): void {
    let itemDir = this.resolveItemDir(projectPath, slug);
    if (!itemDir) {
      itemDir = path.join(projectPath, 'tracker', 'items', slug);
      ensureDirectory(itemDir);
    }
    const payload: ItemStatus = {
      stage: status.stage,
      state: status.state,
      brief_description: (status.brief_description || '').slice(0, 200),
      timestamp: status.timestamp || new Date().toISOString(),
    };
    writeJSONAtomic(path.join(itemDir, 'status.json'), payload);
  }

  // A status is "stale" if its timestamp is older than ITEM_STATUS_STALE_MS.
  // Ralph ignores non-working state on stale records so a crashed agent
  // doesn't suppress nudges indefinitely.
  isItemStatusStale(status: ItemStatus, now: Date = new Date()): boolean {
    const ts = Date.parse(status.timestamp);
    if (Number.isNaN(ts)) return true;
    return now.getTime() - ts > ITEM_STATUS_STALE_MS;
  }

  // Fresh + non-working. Covers both waiting_for_input and waiting_for_approval.
  isItemWaiting(status: ItemStatus | null | undefined, now?: Date): boolean {
    return !!status && status.state !== 'working' && !this.isItemStatusStale(status, now);
  }

  // Fresh + specifically waiting_for_approval. The kanban uses this to render
  // the green "ready to advance" treatment and expose the [m] approve shortcut.
  isItemReadyToAdvance(status: ItemStatus | null | undefined, now?: Date): boolean {
    return !!status && status.state === 'waiting_for_approval' && !this.isItemStatusStale(status, now);
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
    // Mirror the canonical stage into the per-item status.json so ralph (and
    // anything that reads status.json first) sees the new stage immediately.
    // Archive moves don't get a status.json — archived items live outside
    // the live-state protocol.
    if (toStage !== 'archive') {
      // Advancing is a clean slate — the previous brief_description describes
      // finished work, and waiting flags from the old stage don't apply to
      // the new one. Reset to working so ralph can resume normal cadence.
      this.writeItemStatus(projectPath, slug, {
        stage: toStage,
        state: 'working',
        brief_description: '',
        timestamp: new Date().toISOString(),
      });
    }
    return true;
  }

  // Canonical current stage for an item. Prefers the agent's status.json
  // (which is the live self-report), then falls back to index.json bucket
  // membership, then to 'backlog' if the slug is unknown. Never returns null
  // for a known slug — an item always has a stage somewhere.
  // The staleness guard used by ralph (`isItemWaiting`) deliberately doesn't
  // apply here: the last stage the agent wrote is still the correct stage
  // even if the agent crashed 48h ago — nothing would auto-revert it — so
  // stage reads trust status.json unconditionally.
  getItemStage(projectPath: string, slug: string): TrackerStage {
    const status = this.getItemStatus(projectPath, slug);
    if (status) return status.stage;
    const legacy = this.createStageBySlug(this.readIndex(projectPath)).get(slug);
    return legacy ?? 'backlog';
  }

  // Enumerate every known active item grouped by stage. Stage for each slug
  // comes from status.json first; unmigrated items fall back to the index
  // buckets. Archived items are listed verbatim from index.archive.
  // Maps each index-known slug to its canonical stage, with any fresh
  // status.json stage overriding the index bucket. Slugs that exist only in
  // tracker/items/<slug>/ but aren't yet in the index aren't surfaced —
  // callers that need orphan-detection should scan the directory themselves.
  listItemsByStage(projectPath: string): Map<string, TrackerStage> {
    const index = this.readIndex(projectPath);
    const out = this.createStageBySlug(index);
    for (const slug of out.keys()) {
      const status = this.getItemStatus(projectPath, slug);
      if (status) out.set(slug, status.stage);
    }
    return out;
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

  private loadItems(project: string, projectPath: string, stageBySlug: Map<string, TrackerStage>, index: TrackerIndex): TrackerItem[] {
    const items: TrackerItem[] = [];
    const seen = new Set<string>();
    for (const [slug, stage] of stageBySlug.entries()) {
      if (seen.has(slug)) continue;
      const item = this.readItem(project, projectPath, this.bucketForStage(stage), stage, slug, index);
      if (item) {
        items.push(item);
        seen.add(slug);
      }
    }
    return items;
  }

  private sortItemsForBoard(items: TrackerItem[]): TrackerItem[] {
    const active = items.filter(item => !item.inactive);
    const inactive = items.filter(item => item.inactive);
    return [...active, ...inactive];
  }

  private readItem(
    project: string,
    projectPath: string,
    bucket: TrackerBucket,
    stage: TrackerStage,
    slug: string,
    index: TrackerIndex
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
      inactive: index.sessions?.[slug]?.inactive === true,
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
        sessions: {},
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

  getSharedSkillPath(projectPath: string): string {
    return path.join(projectPath, '.agents', 'skills', TRACKER_SKILL_NAME, 'SKILL.md');
  }

  getClaudeSkillPath(projectPath: string): string {
    return path.join(projectPath, '.claude', 'skills', TRACKER_SKILL_NAME, 'SKILL.md');
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
    const INPUT_MODE_LABELS: Record<string, [string, string]> = {
      ask_questions: ['ask_questions tool', 'Use the ask_questions tool whenever you need input. Produces a detectable numbered prompt in the terminal.'],
      inline: ['Inline chat', 'Ask questions inline in the conversation. Before pausing, set state: "waiting_for_input" in status.json with a brief_description; set it back to "working" on resume.'],
      batch: ['Batched', 'Batch every question into a single message — do not ask one at a time. Set state: "waiting_for_input" in status.json before sending; set it back to "working" on resume.'],
      doc_review: ['Doc review', 'Write the stage\'s output file first, then ask the user to review it. Set state: "waiting_for_input" in status.json before asking for review; set it back to "working" on resume.'],
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

${row('Input mode', INPUT_MODE_LABELS, workStyle.inputMode)}
${custom}`;
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
    this.writeStagesProgressionSkillFiles(projectPath, this.loadStagesConfig(projectPath), workStyle);
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
    const sharedSkillPath = this.getSharedSkillPath(item.projectPath);
    const claudeSkillPath = this.getClaudeSkillPath(item.projectPath);

    const indexPath = this.getIndexPath(item.projectPath);
    const fileLines = [
      `  requirements.md     ${rel(requirementsPath)}`,
      `  notes.md            ${rel(notesPath)}${hasNotes ? '' : '  (not yet written)'}`,
      `  implementation.md   ${rel(implementationPath)}${hasImpl ? '' : '  (not yet written)'}`,
      `  tracker/index.json  ${rel(indexPath)}`,
    ];

    const guideLines = [
      `  Skill:         ${rel(sharedSkillPath)}`,
      ...(fs.existsSync(claudeSkillPath) ? [`  Claude skill:  ${rel(claudeSkillPath)}`] : []),
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
Use ask_questions tool when you need to ask the user. Read the generated skill and follow the section for the current stage.`;
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
    this.writeStagesProgressionSkillFiles(projectPath, config as Required<StagesConfig>, this.loadWorkStyle(projectPath));
  }

  saveStageSettings(projectPath: string, stage: Exclude<TrackerStage, 'archive'>, settings: Record<string, string>): void {
    const config = this.loadStagesConfig(projectPath);
    config[stage] = {...config[stage], settings: {...(config[stage].settings || {}), ...settings}};
    this.saveStagesConfig(projectPath, config);
  }

  // ── Stage instruction files ──────────────────────────────────────────────

  getStagesDir(projectPath: string): string {
    return path.join(this.getTrackerPath(projectPath), 'stages');
  }

  getStageFilePath(projectPath: string, stage: Exclude<TrackerStage, 'archive'>): string {
    return path.join(this.getStagesDir(projectPath), `${stage}.md`);
  }

  getOverviewFilePath(projectPath: string): string {
    return path.join(this.getStagesDir(projectPath), 'overview.md');
  }

  private generateStagesProgressionSkillContent(
    stagesConfig: Required<StagesConfig>,
    workStyle: WorkStyle,
  ): string {
    const stageSections = (['discovery', 'requirements', 'implement', 'cleanup'] as const).map(stage => {
      const body = this.defaultStageFileContent(stage, stagesConfig[stage].settings, workStyle).trim();
      return `## ${STAGE_LABELS[stage]}\n\n${body}`;
    }).join('\n\n');

    return `---
name: ${TRACKER_SKILL_NAME}
description: Guides agents through a devteam tracker item across discovery, requirements, implementation, and cleanup. Use when working on a tracked item and you need to follow stage files, keep status.json current, and advance tracker/index.json correctly.
---

# Stages Progression

This skill is generated from tracker configuration. Treat \`tracker/stages.json\`, \`tracker/work-style.json\`, and this skill as the source of truth; do not hand-maintain this file.

## Core Workflow

1. Read the current item stage, item directory, and related files from the launch prompt.
2. Read the matching stage section in this skill.
3. Keep \`tracker/items/<slug>/status.json\` current at every meaningful transition.
4. Write stage outputs in the item directory as directed by the current stage guide.
5. Advance items by moving the slug in \`tracker/index.json\`, then read the next stage guide and continue.
6. This skill is a generated artifact and may be overwritten from tracker config.

## Working Style Snapshot

- Decisions: \`${workStyle.decisionStyle}\`
- Verbosity: \`${workStyle.verbosity}\`
- Questions: \`${workStyle.questions}\`
- Input mode: \`${workStyle.inputMode}\`
- Code scope: \`${workStyle.codeScope}\`
- Testing: \`${workStyle.testing}\`

## Stage Playbooks

${stageSections}
`;
  }

  private writeStagesProgressionSkillFiles(
    projectPath: string,
    stagesConfig: Required<StagesConfig>,
    workStyle: WorkStyle,
  ): void {
    const content = this.generateStagesProgressionSkillContent(stagesConfig, workStyle);
    for (const skillPath of [this.getSharedSkillPath(projectPath), this.getClaudeSkillPath(projectPath)]) {
      ensureDirectory(path.dirname(skillPath));
      fs.writeFileSync(skillPath, content, 'utf8');
    }
  }

  private syncGeneratedTrackerArtifacts(projectPath: string): void {
    const workStyle = this.loadWorkStyle(projectPath);
    const config = this.loadStagesConfig(projectPath);
    this.writeStagesProgressionSkillFiles(projectPath, config, workStyle);
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

Items progress through these stages in order:

1. **Backlog** (\`backlog.md\`) — Item created, not yet being worked on. Triage and describe.
2. **Discovery** (\`discovery.md\`) — Clarify the user problem and approach. Output: \`notes.md\`.
3. **Requirements** (\`requirements.md\`) — Document what to build. Output: \`requirements.md\`.
4. **Implement** (\`implement.md\`) — Build the feature. Output: code + \`implementation.md\`.
5. **Cleanup and submit** (\`cleanup.md\`) — Polish, review, and ship.

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

Read the generated stages progression skill for the project's preferred working style and stage behavior. Honour it throughout all stages.
`;
  }

  defaultStageFileContent(
    stage: Exclude<TrackerStage, 'archive' | 'backlog'>,
    settings?: Record<string, string>,
    workStyle?: WorkStyle,
  ): string {
    return this.defaultStageFileBody(stage, settings) + this.renderStageProtocol(stage, settings, workStyle);
  }

  // Common tail appended to every generated stage guide. Surfaces the
  // gate_on_advance / submit per-stage settings plus the project-global
  // inputMode from WorkStyle, and the status.json self-report protocol
  // that ralph relies on. Kept separate from the per-stage body generator
  // so adding a setting doesn't require touching every stage's case block.
  private renderStageProtocol(
    stage: Exclude<TrackerStage, 'archive'>,
    settings?: Record<string, string>,
    workStyle?: WorkStyle,
  ): string {
    if (stage === 'backlog') return ''; // status.json + gates don't apply pre-discovery
    const s = settings || {};
    // inputMode is a project-global preference, not per-stage. It lives on
    // WorkStyle and falls back to the default when absent (e.g., tests that
    // don't pass a workStyle).
    const inputMode: InputModeStyle = workStyle?.inputMode ?? DEFAULT_WORK_STYLE.inputMode;
    // Back-compat: old configs might still have 'none' / 'review_and_advance' /
    // 'wait_for_approval'. Map them onto the current two-value shape.
    const rawGate = s['gate_on_advance'] ?? (stage === 'requirements' || stage === 'cleanup'
      ? 'require_approval'
      : 'auto_advance');
    const gate =
      rawGate === 'wait_for_approval' ? 'require_approval'
      : rawGate === 'none' || rawGate === 'review_and_advance' ? 'auto_advance'
      : rawGate;
    const submit = s['submit'] ?? 'approve';
    const outputFile =
      stage === 'discovery' ? 'notes.md'
      : stage === 'requirements' ? 'requirements.md'
      : stage === 'implement' ? 'implementation.md'
      : 'implementation.md';

    const inputInstruction = (() => {
      switch (inputMode) {
        case 'inline':
          return 'Ask questions inline in the conversation when you need input. Before sending each question, set `state: "waiting_for_input"` in `status.json` with a `brief_description` of what you need. Set it back to `"working"` the moment you receive the user\'s response and resume work.';
        case 'batch':
          return 'Batch every question you have into a single message — do not ask one at a time. Before sending the batched message, set `state: "waiting_for_input"` in `status.json` with a `brief_description` summarising the batch. Clear it to `"working"` when the user replies.';
        case 'doc_review':
          return `Write the stage's output file (\`${outputFile}\`) first. Then ask the user to review it. Before asking for review, set \`state: "waiting_for_input"\` in \`status.json\` with a \`brief_description\` of what you need reviewed. Clear it to \`"working"\` when the user responds.`;
        case 'ask_questions':
        default:
          return 'Use the `ask_questions` tool when you need input from the user. Keep `status.json` up to date — set `state: "waiting_for_input"` with a `brief_description` when you\'re waiting, and set it back to `"working"` when the user responds.';
      }
    })();

    const gateInstruction = (() => {
      switch (gate) {
        case 'auto_advance':
          return `Advance without asking. Before you do, if this stage produced meaningful findings, decisions, or changes, append a short "## Stage review" section (1–3 sentences) to \`${outputFile}\` summarising what you did — skip the review for trivial no-op stages. Then update \`status.json.stage\` to the next stage and continue.`;
        case 'require_approval':
          return 'When the stage\'s work is complete, pause and ask for the user\'s approval to advance. Set `state: "waiting_for_approval"` in `status.json` with a `brief_description` that summarises what the user should review (e.g., "caching layer complete"). Do not update `status.json.stage` until the user explicitly approves. When they do, set `state: "working"` and update `stage`.';
        default:
          return '';
      }
    })();

    const submitBlock = stage === 'cleanup'
      ? (submit === 'auto'
          ? '\n### Submit (PR creation)\n\nAfter cleanup passes, open the PR automatically — no extra approval step.\n'
          : '\n### Submit (PR creation)\n\nAfter cleanup passes, pause and ask the user for explicit approval using this stage\'s input mode before opening the PR. Do not create the PR until approved.\n')
      : '';

    return `
## Agent status protocol

You must keep \`tracker/items/<slug>/status.json\` current. It's the canonical live state for this item and ralph reads it to decide whether you're stuck or legitimately waiting. The kanban renders \`brief_description\` directly on the card, so write about *substance*, not stage identity.

Schema:
\`\`\`json
{
  "stage": "${stage}",
  "state": "working",
  "brief_description": "the concrete thing you're doing or need (≤ 200 chars)",
  "timestamp": "ISO-8601 now"
}
\`\`\`

\`state\` is one of:

- \`"working"\` — actively progressing. No human needed.
- \`"waiting_for_input"\` — mid-stage, blocked on a clarification from the user. \`brief_description\` should name the specific question.
- \`"waiting_for_approval"\` — stage work is done; asking the user to sign off before advancing. Set this only when the gate is \`require_approval\`. \`brief_description\` should summarise what's ready for review.

Ralph suppresses check-ins whenever \`state\` isn't \`"working"\`. The kanban renders approval-state cards with a distinct "ready to advance" treatment, so use it specifically — not as a generic waiting catch-all.

\`brief_description\` guidance — the stage is already visible from the kanban column. Write about the *work*:

- Good: \`drafting acceptance criteria for the caching layer\`, \`blocked: do we want retry-on-429?\`, \`ran the suite, 3 failing in auth spec\`, \`caching layer complete\`.
- Not useful: \`in requirements stage\`, \`doing discovery\`, \`working on implement\`.

Update \`status.json\` at every meaningful transition:

- **Stage start**: write the file with the current stage and \`state: "working"\`.
- **Blocked on a clarification**: set \`state: "waiting_for_input"\`; put the concrete ask in \`brief_description\`.
- **Stage work complete, awaiting approval**: set \`state: "waiting_for_approval"\`; summarise what's ready.
- **Resuming or advancing**: set \`state: "working"\` and update \`brief_description\` to what you're now doing; update \`stage\` if you're moving to the next one.

### Input mode: \`${inputMode}\`

${inputInstruction}
${stage === 'discovery'
  ? '\n(Advance behaviour for discovery is governed by the `Report` setting in the stage body above — the generic gate_on_advance does not apply here.)\n'
  : `\n### Gate on advance: \`${gate}\`\n\n${gateInstruction}\n`}${submitBlock}`;
  }

  // Original per-stage content generator — the body that the user edits via
  // the stages screen. Kept private and wrapped by defaultStageFileContent()
  // so the status/gate protocol is always appended.
  private defaultStageFileBody(stage: Exclude<TrackerStage, 'archive' | 'backlog'>, settings?: Record<string, string>): string {
    const s = settings || {};
    const numbered = (items: (string | null)[]): string =>
      items.filter((x): x is string => !!x).map((x, i) => `${i + 1}. ${x}`).join('\n');

    switch (stage) {
      // No 'backlog' case — the stage is deprecated (merged into discovery
      // for display purposes) and `ensureStageFiles` doesn't emit backlog.md.
      case 'discovery': {
        // Effort = research scope (code + web). Asking the user is a
        // narrow, baked-in behaviour — not a tunable — because most
        // clarification belongs in requirements.
        const effort = s['effort'] ?? 'standard';
        const report = s['report'] ?? 'confirm_if_notable';

        const researchStep =
          effort === 'skim'
            ? 'Skim codebase for duplicates.'
            : effort === 'deep'
            ? 'Thorough codebase scan: patterns, conflicts, tests. Web research: domain, APIs, prior art, alternatives.'
            : 'Scan codebase for related patterns. Web search if the domain is unfamiliar.';

        const reportStep = (() => {
          switch (report) {
            case 'just_advance':
              return 'Advance silently.';
            case 'always_confirm':
              return 'Summarise findings, set `state: "waiting_for_approval"` with a `brief_description` summarising what was found, and wait for approval.';
            case 'confirm_if_notable':
            default:
              return 'If findings are notable (surprise, risk, pivot, conflict, alternative), summarise and set `state: "waiting_for_approval"` with a `brief_description` summarising what was found. Otherwise advance silently.';
          }
        })();

        const outputFields =
          effort === 'skim'
            ? 'Problem, Recommendation.'
            : effort === 'deep'
            ? 'Problem; Context (code + research); Options (2+ with tradeoffs); Recommendation (reasoning + risks).'
            : 'Problem, Findings, Recommendation.';

        return `# Discovery

Research the problem — code and domain. Trivial items (typo, rename, doc): one-line \`notes.md\`, advance. Clarifying questions: only if the request itself is unreadable; "X or Y?" trade-offs belong in requirements.

${numbered([
  researchStep,
  `Write \`notes.md\`: ${outputFields}`,
  reportStep,
])}

Advance: set \`status.json.stage\` to \`requirements\`.
`;
      }

      case 'requirements': {
        // Two knobs: collaboration shape (style) + spec depth (detail).
        // Check-in cadence is governed by the project inputMode, not here.
        const style = s['style'] ?? 'interview';
        const detail = s['detail'] ?? 'standard';

        const collabStep = style === 'draft_first'
          ? 'Draft a strawman `requirements.md` from `notes.md` before asking anything. Share the draft; collect corrections per the project inputMode.'
          : 'Ask targeted questions about acceptance criteria, edge cases, and constraints — batch them, follow the project inputMode. Then draft.';

        const sections: string[] = [
          '- **Problem** + **Why** — copied from `notes.md` (do not drop or rewrite).',
          '- **Summary** — one paragraph of what will be built.',
          '- **Acceptance criteria** — numbered testable conditions.',
        ];
        if (detail !== 'minimal') sections.push('- **Edge cases** — boundary conditions.');
        if (detail === 'thorough') {
          sections.push('- **Constraints** — technical / performance / security / UX.');
          sections.push('- **Dependencies** — other items or systems.');
          sections.push('- **Out of scope** — what is NOT being built.');
        }
        const minWords = detail === 'minimal' ? 30 : detail === 'thorough' ? 100 : 50;

        return `# Requirements

Document what to build. Always preserve the **Problem** and **Why** from \`notes.md\` — copy them verbatim; never paraphrase them away.

${numbered([
  'Read `notes.md` and the existing `requirements.md` stub.',
  collabStep,
  `Write \`requirements.md\` in order:\n${sections.join('\n')}`,
])}

Minimum ${minWords} words of real content.
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

        return `# Implement

**Goal**: Build the feature according to the requirements.

## Steps

${numbered(steps)}

## Output

${outputLines.join('\n')}

## Advancing

When implementation is complete${tdd !== 'skip' ? ' and tests pass' : ''}: update the `+"`"+`tracker/index.json`+"`"+` (path is in the prompt, relative to cwd) slug to `+"`"+`implementation.cleanup`+"`"+`. Then continue with the Cleanup and submit section in the stages progression skill.
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

        return `# Cleanup and submit

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
    this.syncGeneratedTrackerArtifacts(projectPath);
  }

  async editStageFileWithAI(projectPath: string, stage: Exclude<TrackerStage, 'archive' | 'backlog'>, userPrompt: string): Promise<{success: boolean; error?: string}> {
    const current = this.loadStagesConfig(projectPath);
    const stageConfig = current[stage];
    const prompt = `You are editing one stage of a devteam tracker configuration. This config drives a generated shared skill file for agents.

Current stage key: ${stage}

Current stage config (JSON):
${JSON.stringify(stageConfig, null, 2)}

Current generated preview:
${this.defaultStageFileContent(stage, stageConfig.settings, this.loadWorkStyle(projectPath))}

User request: ${userPrompt}

Return ONLY the complete updated JSON object for this one stage with keys:
- actionLabel (string)
- description (string)
- checklist (string[])
- agentPrompt (string)
- exitCriteria (array, preserve existing unless intentionally changing)
- settings (object)

No markdown, no code fences, no explanation.`;
    const result = await runClaudeAsync(prompt, {cwd: projectPath, timeoutMs: 60000});
    if (!result.success) return {success: false, error: result.error || 'Claude failed'};
    const json = extractJsonObject(result.output);
    if (!json) return {success: false, error: 'No JSON in response'};
    try {
      const parsed = JSON.parse(json) as StageConfig;
      const next: Required<StagesConfig> = {...current};
      next[stage] = {
        ...current[stage],
        ...parsed,
        exitCriteria: parsed.exitCriteria ?? current[stage].exitCriteria,
      };
      this.saveStagesConfig(projectPath, next);
      return {success: true};
    } catch {
      return {success: false, error: 'Failed to parse AI response'};
    }
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
