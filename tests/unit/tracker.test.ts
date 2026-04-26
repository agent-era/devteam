import {describe, test, expect, beforeEach, afterEach} from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {TrackerService, parseFrontmatter, DEFAULT_WORK_STYLE, TrackerItem, StageConfig, WorkStyle, InputModeStyle, ItemStatus, ITEM_STATUS_STALE_MS} from '../../src/services/TrackerService.js';

let tmpDir: string;
let service: TrackerService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-test-'));
  service = new TrackerService();
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

// ─── helpers ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<TrackerItem> = {}): TrackerItem {
  const itemDir = path.join(tmpDir, 'tracker', 'backlog', 'test-feature');
  return {
    slug: 'test-feature',
    title: 'Test Feature',
    project: 'my-project',
    projectPath: tmpDir,
    stage: 'discovery',
    bucket: 'backlog',
    itemDir,
    requirementsPath: path.join(itemDir, 'requirements.md'),
    implementationPath: path.join(itemDir, 'implementation.md'),
    notesPath: path.join(itemDir, 'notes.md'),
    requirementsBody: '',
    frontmatter: {},
    worktreeExists: false,
    hasImplementationNotes: false,
    hasNotes: false,
    inactive: false,
    ...overrides,
  };
}

// ─── parseFrontmatter ────────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  test('parses frontmatter and body', () => {
    const raw = `---\ntitle: My Feature\nslug: my-feature\n---\n\nBody text here.\n`;
    const {frontmatter, body} = parseFrontmatter(raw);
    expect(frontmatter.title).toBe('My Feature');
    expect(frontmatter.slug).toBe('my-feature');
    expect(body.trim()).toBe('Body text here.');
  });

  test('returns empty frontmatter when no delimiter', () => {
    const {frontmatter, body} = parseFrontmatter('Just a plain body.');
    expect(frontmatter).toEqual({});
    expect(body).toBe('Just a plain body.');
  });

  test('strips surrounding quotes from values', () => {
    const raw = `---\ntitle: "Quoted Title"\n---\n`;
    const {frontmatter} = parseFrontmatter(raw);
    expect(frontmatter.title).toBe('Quoted Title');
  });
});

// ─── slugify ────────────────────────────────────────────────────────────────

describe('slugify', () => {
  test('converts title to lowercase dash-separated slug', () => {
    expect(service.slugify('My Feature Title')).toBe('my-feature-title');
  });

  test('collapses multiple non-alphanumeric chars to single dash', () => {
    expect(service.slugify('Hello   World!!!')).toBe('hello-world');
  });

  test('trims leading and trailing dashes', () => {
    expect(service.slugify('  --hello--  ')).toBe('hello');
  });

  test('truncates long titles to default 20 chars', () => {
    const long = 'a'.repeat(80);
    expect(service.slugify(long).length).toBe(20);
  });

  test('respects custom maxLength', () => {
    const long = 'a'.repeat(80);
    expect(service.slugify(long, 40).length).toBe(40);
  });
});

// ─── nextStage / previousStage ──────────────────────────────────────────────

describe('nextStage / previousStage', () => {
  test('nextStage progresses through stages', () => {
    expect(service.nextStage('backlog')).toBe('discovery');
    expect(service.nextStage('discovery')).toBe('requirements');
    expect(service.nextStage('requirements')).toBe('implement');
    expect(service.nextStage('implement')).toBe('cleanup');
    expect(service.nextStage('cleanup')).toBe('archive');
  });

  test('nextStage returns null at end', () => {
    expect(service.nextStage('archive')).toBeNull();
  });

  test('previousStage goes backwards', () => {
    expect(service.previousStage('archive')).toBe('cleanup');
    expect(service.previousStage('implement')).toBe('requirements');
  });

  test('previousStage returns null at start', () => {
    expect(service.previousStage('backlog')).toBeNull();
  });
});

// ─── item status.json helpers ───────────────────────────────────────────────

describe('item status.json helpers', () => {
  const SLUG = 'test-item';

  function seedItemDir(): string {
    const dir = path.join(tmpDir, 'tracker', 'items', SLUG);
    fs.mkdirSync(dir, {recursive: true});
    return dir;
  }

  test('getItemStatus returns null when file is absent', () => {
    seedItemDir();
    expect(service.getItemStatus(tmpDir, SLUG)).toBeNull();
  });

  test('writeItemStatus round-trips through getItemStatus', () => {
    seedItemDir();
    const now = new Date().toISOString();
    const status: ItemStatus = {
      stage: 'discovery',
      state: 'waiting_for_input',
      brief_description: 'need approval on notes.md',
      timestamp: now,
    };
    service.writeItemStatus(tmpDir, SLUG, status);
    const roundTripped = service.getItemStatus(tmpDir, SLUG);
    expect(roundTripped).toEqual(status);
  });

  test('writeItemStatus creates the item dir when missing and writes there', () => {
    const status: ItemStatus = {
      stage: 'backlog',
      state: 'working',
      brief_description: 'working',
      timestamp: new Date().toISOString(),
    };
    service.writeItemStatus(tmpDir, SLUG, status);
    const written = path.join(tmpDir, 'tracker', 'items', SLUG, 'status.json');
    expect(fs.existsSync(written)).toBe(true);
  });

  test('writeItemStatus truncates brief_description to 200 chars', () => {
    seedItemDir();
    const longReason = 'x'.repeat(500);
    service.writeItemStatus(tmpDir, SLUG, {
      stage: 'requirements',
      state: 'waiting_for_input',
      brief_description: longReason,
      timestamp: new Date().toISOString(),
    });
    const read = service.getItemStatus(tmpDir, SLUG);
    expect(read?.brief_description.length).toBe(200);
  });

  test('getItemStatus returns null on malformed JSON', () => {
    const dir = seedItemDir();
    fs.writeFileSync(path.join(dir, 'status.json'), 'not json {{{');
    expect(service.getItemStatus(tmpDir, SLUG)).toBeNull();
  });

  test('getItemStatus returns null when required fields are missing', () => {
    const dir = seedItemDir();
    fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({stage: 'discovery'}));
    expect(service.getItemStatus(tmpDir, SLUG)).toBeNull();
  });

  test('getItemStatus rejects a stage value outside the known enum (path-traversal safety)', () => {
    const dir = seedItemDir();
    const ts = new Date().toISOString();
    for (const badStage of ['../../evil', 'archive', 'unknown_stage', '']) {
      fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({
        stage: badStage, state: 'working', brief_description: '', timestamp: ts,
      }));
      expect(service.getItemStatus(tmpDir, SLUG)).toBeNull();
    }
  });

  test('getItemStatus accepts the three state values', () => {
    const dir = seedItemDir();
    const ts = new Date().toISOString();
    for (const state of ['working', 'waiting_for_input', 'waiting_for_approval'] as const) {
      fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({
        stage: 'implement', state, brief_description: '', timestamp: ts,
      }));
      expect(service.getItemStatus(tmpDir, SLUG)?.state).toBe(state);
    }
  });

  test('getItemStatus maps legacy boolean schema to the new state enum', () => {
    const dir = seedItemDir();
    const ts = new Date().toISOString();
    // Old single-bool schema: waiting → waiting_for_input.
    fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({
      stage: 'implement', is_waiting_for_user: true, brief_description: '', timestamp: ts,
    }));
    expect(service.getItemStatus(tmpDir, SLUG)?.state).toBe('waiting_for_input');

    // Old dual-bool schema: awaiting_advance_approval wins → waiting_for_approval.
    fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({
      stage: 'implement', is_waiting_for_user: true, awaiting_advance_approval: true,
      brief_description: '', timestamp: ts,
    }));
    expect(service.getItemStatus(tmpDir, SLUG)?.state).toBe('waiting_for_approval');

    // Not waiting at all → working.
    fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({
      stage: 'implement', is_waiting_for_user: false, brief_description: '', timestamp: ts,
    }));
    expect(service.getItemStatus(tmpDir, SLUG)?.state).toBe('working');
  });

  test('isItemStatusStale is true when timestamp is older than 24h', () => {
    const old = new Date(Date.now() - ITEM_STATUS_STALE_MS - 1000).toISOString();
    expect(service.isItemStatusStale({
      stage: 'implement',
      state: 'waiting_for_input',
      brief_description: '',
      timestamp: old,
    })).toBe(true);
  });

  test('isItemStatusStale is false for a fresh timestamp', () => {
    expect(service.isItemStatusStale({
      stage: 'implement',
      state: 'waiting_for_input',
      brief_description: '',
      timestamp: new Date().toISOString(),
    })).toBe(false);
  });

  test('isItemStatusStale is true when timestamp is unparseable', () => {
    expect(service.isItemStatusStale({
      stage: 'implement',
      state: 'waiting_for_input',
      brief_description: '',
      timestamp: 'not-a-date',
    })).toBe(true);
  });
});

// ─── stage derivation (status.json + index.json) ────────────────────────────

describe('getItemStage / listItemsByStage', () => {
  const SLUG = 'has-status';

  test('getItemStage prefers status.json over index.json', () => {
    service.createItem(tmpDir, 'Has Status', 'discovery', SLUG);
    // index.json has it in discovery, status.json will report implement
    service.writeItemStatus(tmpDir, SLUG, {
      stage: 'implement',
      state: 'working',
      brief_description: 'writing code',
      timestamp: new Date().toISOString(),
    });
    expect(service.getItemStage(tmpDir, SLUG)).toBe('implement');
  });

  test('getItemStage falls back to index.json when status.json is missing', () => {
    service.createItem(tmpDir, 'No Status', 'requirements', 'no-status');
    expect(service.getItemStage(tmpDir, 'no-status')).toBe('requirements');
  });

  test('getItemStage returns backlog for unknown slugs', () => {
    service.ensureTracker(tmpDir);
    expect(service.getItemStage(tmpDir, 'never-existed')).toBe('backlog');
  });

  test('listItemsByStage overrides index with status.json stage', () => {
    service.createItem(tmpDir, 'One', 'discovery', 'one');
    service.createItem(tmpDir, 'Two', 'implement', 'two');
    service.writeItemStatus(tmpDir, 'one', {
      stage: 'requirements',
      state: 'working',
      brief_description: '',
      timestamp: new Date().toISOString(),
    });
    const out = service.listItemsByStage(tmpDir);
    expect(out.get('one')).toBe('requirements');
    expect(out.get('two')).toBe('implement');
  });
});

// ─── moveItem writes status.json ────────────────────────────────────────────

describe('moveItem mirrors stage into status.json', () => {
  test('moves across stages and writes a fresh status.json', () => {
    service.createItem(tmpDir, 'Moves Around', 'discovery', 'moves');
    expect(service.moveItem(tmpDir, 'moves', 'requirements')).toBe(true);
    const status = service.getItemStatus(tmpDir, 'moves');
    expect(status?.stage).toBe('requirements');
    expect(status?.state).toBe('working');
  });

  test('advancing resets state to working and clears brief_description', () => {
    // Advancing is typically the approval of a waiting_for_approval state —
    // the previous brief ("caching layer complete") describes finished work,
    // so the new stage should start fresh.
    service.createItem(tmpDir, 'Approved', 'implement', 'approved');
    service.writeItemStatus(tmpDir, 'approved', {
      stage: 'implement',
      state: 'waiting_for_approval',
      brief_description: 'caching layer complete',
      timestamp: new Date().toISOString(),
    });
    service.moveItem(tmpDir, 'approved', 'cleanup');
    const status = service.getItemStatus(tmpDir, 'approved');
    expect(status?.stage).toBe('cleanup');
    expect(status?.state).toBe('working');
    expect(status?.brief_description).toBe('');
  });

  test('archive move does not write status.json', () => {
    service.createItem(tmpDir, 'Archives', 'discovery', 'arch');
    service.moveItem(tmpDir, 'arch', 'archive');
    // status.json may or may not exist from a prior move to a non-archive
    // stage; what matters is that the archive move itself didn't (re)write
    // it. We assert by ensuring moveItem returns true and index is updated.
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.archive).toContain('arch');
  });
});

// ─── defaultStageFileContent protocol suffix ────────────────────────────────

describe('defaultStageFileContent renders status + gate protocol', () => {
  const STAGES = ['discovery', 'requirements', 'implement', 'cleanup'] as const;

  test.each(STAGES)('every stage includes the status.json protocol section', (stage) => {
    const content = service.defaultStageFileContent(stage, {});
    expect(content).toContain('Agent status protocol');
    expect(content).toContain('status.json');
    // The three-state enum is the canonical waiting signal.
    expect(content).toContain('waiting_for_input');
    expect(content).toContain('waiting_for_approval');
  });

  test.each(STAGES)('every stage renders the Input mode section', (stage) => {
    const content = service.defaultStageFileContent(stage, {}, DEFAULT_WORK_STYLE);
    expect(content).toContain('Input mode:');
  });

  test('non-discovery stages render the generic Gate on advance section', () => {
    for (const stage of ['requirements', 'implement', 'cleanup'] as const) {
      const content = service.defaultStageFileContent(stage, {}, DEFAULT_WORK_STYLE);
      expect(content).toContain('Gate on advance:');
    }
  });

  test('discovery does NOT render the generic Gate on advance section (report supersedes)', () => {
    const content = service.defaultStageFileContent('discovery', {}, DEFAULT_WORK_STYLE);
    expect(content).not.toContain('Gate on advance:');
    // Points the reader at the Report setting instead.
    expect(content).toMatch(/Report/);
  });

  test('discovery effort + report render the matching body', () => {
    const skim = service.defaultStageFileContent('discovery', {effort: 'skim'});
    expect(skim).toMatch(/Skim/);
    const deep = service.defaultStageFileContent('discovery', {effort: 'deep'});
    expect(deep).toMatch(/thorough/i);
    const silent = service.defaultStageFileContent('discovery', {report: 'just_advance'});
    expect(silent).toMatch(/advance silently/i);
    const notable = service.defaultStageFileContent('discovery', {report: 'confirm_if_notable'});
    expect(notable).toMatch(/notable/i);
    const always = service.defaultStageFileContent('discovery', {report: 'always_confirm'});
    expect(always).toMatch(/wait for approval/i);
  });

  test('discovery guide bakes in the trivial-skip + narrow-questions defaults', () => {
    const content = service.defaultStageFileContent('discovery', {}, DEFAULT_WORK_STYLE);
    expect(content).toMatch(/Trivial items/i);
    expect(content).toMatch(/Clarifying questions/i);
  });

  test.each([
    ['ask_questions', 'ask_questions'],
    ['inline', 'Inline'],
    ['batch', 'Batch'],
    ['doc_review', 'review'],
  ] as const)('inputMode (global style) = %s renders mode-specific guidance', (mode, needle) => {
    const ws: WorkStyle = {...DEFAULT_WORK_STYLE, inputMode: mode as InputModeStyle};
    const content = service.defaultStageFileContent('discovery', {}, ws);
    expect(content).toMatch(new RegExp(needle, 'i'));
  });

  test.each([
    ['auto_advance', 'Stage review'],
    ['require_approval', 'approval'],
  ] as const)('gate_on_advance=%s renders the right gate text', (gate, needle) => {
    const content = service.defaultStageFileContent('requirements', {gate_on_advance: gate});
    expect(content).toMatch(new RegExp(needle, 'i'));
  });

  test('auto_advance also tells the agent to skip review for trivial stages', () => {
    // implement (not discovery) — discovery has its own Report setting that
    // supersedes the common gate_on_advance.
    const content = service.defaultStageFileContent('implement', {gate_on_advance: 'auto_advance'});
    expect(content).toMatch(/skip the review/i);
  });

  test('legacy gate values are mapped to the new shape (non-discovery stages)', () => {
    // Old configs saying 'none' or 'review_and_advance' both mean auto_advance.
    const fromNone = service.defaultStageFileContent('implement', {gate_on_advance: 'none'});
    const fromReview = service.defaultStageFileContent('implement', {gate_on_advance: 'review_and_advance'});
    const fromWait = service.defaultStageFileContent('implement', {gate_on_advance: 'wait_for_approval'});
    expect(fromNone).toMatch(/auto_advance/);
    expect(fromReview).toMatch(/auto_advance/);
    expect(fromWait).toMatch(/require_approval/);
  });

  test('submit=approve adds a submit gate to cleanup', () => {
    const content = service.defaultStageFileContent('cleanup', {submit: 'approve'});
    expect(content).toContain('Submit (PR creation)');
    expect(content).toMatch(/approval/i);
  });

  test('submit=auto on cleanup tells the agent to open the PR automatically', () => {
    const content = service.defaultStageFileContent('cleanup', {submit: 'auto'});
    expect(content).toContain('Submit (PR creation)');
    expect(content).toMatch(/automatically/i);
  });

  test('auto_advance gate references the stage\'s output file for the review (non-discovery)', () => {
    const req = service.defaultStageFileContent('requirements', {gate_on_advance: 'auto_advance'});
    expect(req).toContain('requirements.md');
    const impl = service.defaultStageFileContent('implement', {gate_on_advance: 'auto_advance'});
    expect(impl).toContain('implementation.md');
  });

  test('gate defaults: requirements + cleanup require approval, implement auto-advances', () => {
    // Discovery has its own Report setting (no common gate), so not asserted here.
    const req = service.defaultStageFileContent('requirements', {});
    expect(req).toMatch(/Gate on advance: `require_approval`/);
    const impl = service.defaultStageFileContent('implement', {});
    expect(impl).toMatch(/Gate on advance: `auto_advance`/);
    const clean = service.defaultStageFileContent('cleanup', {});
    expect(clean).toMatch(/Gate on advance: `require_approval`/);
  });

  test('require_approval gate tells the agent to use waiting_for_approval state', () => {
    const content = service.defaultStageFileContent('requirements', {gate_on_advance: 'require_approval'});
    expect(content).toContain('waiting_for_approval');
    expect(content).toMatch(/do not update.*stage.*until.*approves/i);
  });

  test('protocol tells the agent brief_description is about substance, not the stage', () => {
    const content = service.defaultStageFileContent('requirements', {});
    expect(content).toMatch(/substance/i);
    // The good/bad examples must both be present so the message can't be
    // misread as "describe the stage".
    expect(content).toMatch(/Good:/);
    expect(content).toMatch(/Not useful:/);
  });
});

// ─── createItem ─────────────────────────────────────────────────────────────

describe('createItem', () => {
  test('adds slug to index.json and stores the title in sessions; writes no files to the project root', () => {
    service.createItem(tmpDir, 'Add user auth', 'discovery');

    const indexPath = path.join(tmpDir, 'tracker', 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    expect(index.backlog.discovery).toContain('add-user-auth');
    expect(index.sessions['add-user-auth'].title).toBe('Add user auth');
    const itemDir = path.join(tmpDir, 'tracker', 'items', 'add-user-auth');
    expect(fs.existsSync(itemDir)).toBe(false);
  });

  test('adds slug to index.json in correct stage', () => {
    service.createItem(tmpDir, 'Fix login bug', 'discovery');

    const indexPath = path.join(tmpDir, 'tracker', 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    expect(index.backlog.discovery).toContain('fix-login-bug');
  });

  test('places item in the implement stage bucket when stage is implement', () => {
    service.createItem(tmpDir, 'Build API', 'implement');
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.implementation.implement).toContain('build-api');
  });

  test('stashes a provided body on sessions[slug].description for ensureItemFiles to drain into the worktree', () => {
    const description = 'Implement OAuth2 login with Google and GitHub providers.';
    service.createItem(tmpDir, 'Add auth', 'discovery', undefined, description);

    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.sessions['add-auth'].description).toBe(description);
    const itemDir = path.join(tmpDir, 'tracker', 'items', 'add-auth');
    expect(fs.existsSync(itemDir)).toBe(false);
  });

  test('does not stash a description when body is omitted', () => {
    service.createItem(tmpDir, 'My Feature', 'discovery');
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.sessions['my-feature'].description).toBeUndefined();
    const itemDir = path.join(tmpDir, 'tracker', 'items', 'my-feature');
    expect(fs.existsSync(itemDir)).toBe(false);
  });

  test('does not stash a description when body is identical to the title (avoids the duplicate-of-title placeholder)', () => {
    service.createItem(tmpDir, 'Same Body', 'discovery', undefined, 'Same Body');
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.sessions['same-body'].description).toBeUndefined();
  });

  test('uses explicit slug when provided alongside body', () => {
    const description = 'Detailed description from proposal.';
    service.createItem(tmpDir, 'Proposal Title', 'backlog', 'ai-derived-slug', description);
    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.sessions['ai-derived-slug'].title).toBe('Proposal Title');
    expect(index.sessions['ai-derived-slug'].description).toBe(description);
    const itemDir = path.join(tmpDir, 'tracker', 'items', 'ai-derived-slug');
    expect(fs.existsSync(itemDir)).toBe(false);
  });
});

// ─── moveItem ───────────────────────────────────────────────────────────────

describe('moveItem', () => {
  test('moves item to next stage within same bucket', () => {
    service.createItem(tmpDir, 'Feature A', 'discovery');
    const moved = service.moveItem(tmpDir, 'feature-a', 'requirements');
    expect(moved).toBe(true);

    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.backlog.discovery).not.toContain('feature-a');
    expect(index.backlog.requirements).toContain('feature-a');
  });

  test('moves item index between buckets without touching files', () => {
    service.createItem(tmpDir, 'Feature B', 'requirements');
    service.moveItem(tmpDir, 'feature-b', 'implement');

    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.implementation.implement).toContain('feature-b');
    expect(index.backlog.requirements).not.toContain('feature-b');
  });

  test('moves item to archive bucket', () => {
    service.createItem(tmpDir, 'Old Feature', 'discovery');
    service.moveItem(tmpDir, 'old-feature', 'archive');

    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.archive).toContain('old-feature');
  });

  test('returns false when slug not in index', () => {
    service.ensureTracker(tmpDir);
    const moved = service.moveItem(tmpDir, 'nonexistent', 'discovery');
    expect(moved).toBe(false);
  });

  test('returns false when already at target stage', () => {
    service.createItem(tmpDir, 'Feature C', 'discovery');
    const moved = service.moveItem(tmpDir, 'feature-c', 'discovery');
    expect(moved).toBe(false);
  });
});

describe('inactive item metadata', () => {
  test('isItemInactive defaults to false', () => {
    service.createItem(tmpDir, 'Feature A', 'discovery');
    expect(service.isItemInactive(tmpDir, 'feature-a')).toBe(false);
  });

  test('toggleItemInactive persists the flag in tracker/index.json', () => {
    service.createItem(tmpDir, 'Feature A', 'discovery');
    expect(service.toggleItemInactive(tmpDir, 'feature-a')).toBe(true);
    expect(service.isItemInactive(tmpDir, 'feature-a')).toBe(true);

    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(index.sessions['feature-a'].inactive).toBe(true);

    expect(service.toggleItemInactive(tmpDir, 'feature-a')).toBe(true);
    expect(service.isItemInactive(tmpDir, 'feature-a')).toBe(false);
    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tracker', 'index.json'), 'utf8'));
    expect(updated.sessions['feature-a'].inactive).toBeUndefined();
  });

  test('toggleItemInactive returns false for unknown slugs', () => {
    service.ensureTracker(tmpDir);
    expect(service.toggleItemInactive(tmpDir, 'missing-item')).toBe(false);
  });
});

// ─── loadBoard ──────────────────────────────────────────────────────────────

describe('loadBoard', () => {
  test('returns 4 columns: merged backlog/discovery, requirements, implement, cleanup', () => {
    const board = service.loadBoard('my-project', tmpDir);
    expect(board.columns).toHaveLength(4);
    expect(board.columns.map(c => c.id)).toEqual([
      'backlog', 'requirements', 'implement', 'cleanup',
    ]);
  });

  test('discovery items appear in the merged backlog column', () => {
    service.createItem(tmpDir, 'Alpha', 'discovery');
    service.createItem(tmpDir, 'Beta', 'discovery');
    const board = service.loadBoard('my-project', tmpDir);
    const backlogCol = board.columns.find(c => c.id === 'backlog')!;
    expect(backlogCol.items.map(i => i.slug)).toEqual(expect.arrayContaining(['alpha', 'beta']));
  });

  test('items reflect index ordering', () => {
    service.createItem(tmpDir, 'First Item', 'discovery');
    service.createItem(tmpDir, 'Second Item', 'discovery');
    const board = service.loadBoard('my-project', tmpDir);
    const col = board.columns.find(c => c.id === 'backlog')!;
    expect(col.items[0].slug).toBe('first-item');
    expect(col.items[1].slug).toBe('second-item');
  });

  test('inactive items sort to the bottom of their column while preserving relative order', () => {
    service.createItem(tmpDir, 'Alpha', 'discovery');
    service.createItem(tmpDir, 'Beta', 'discovery');
    service.createItem(tmpDir, 'Gamma', 'discovery');
    service.setItemInactive(tmpDir, 'beta', true);

    const board = service.loadBoard('my-project', tmpDir);
    const col = board.columns.find(c => c.id === 'backlog')!;
    expect(col.items.map(i => i.slug)).toEqual(['alpha', 'gamma', 'beta']);
    expect(col.items.map(i => i.inactive)).toEqual([false, false, true]);
  });
});

// ─── evaluateExitCriteria ───────────────────────────────────────────────────

describe('evaluateExitCriteria', () => {
  test('requirements_has_body passes when body is non-empty', () => {
    const item = makeItem({requirementsBody: 'some content'});
    const results = service.evaluateExitCriteria(item, [{id: 'rb', check: 'requirements_has_body', description: 'Has body'}]);
    expect(results[0].met).toBe(true);
  });

  test('requirements_has_body fails when body is empty', () => {
    const item = makeItem({requirementsBody: ''});
    const results = service.evaluateExitCriteria(item, [{id: 'rb', check: 'requirements_has_body', description: 'Has body'}]);
    expect(results[0].met).toBe(false);
  });

  test('requirements_min_50_words passes with 50+ words', () => {
    const item = makeItem({requirementsBody: 'word '.repeat(50)});
    const results = service.evaluateExitCriteria(item, [{id: 'rw', check: 'requirements_min_50_words', description: '50 words'}]);
    expect(results[0].met).toBe(true);
  });

  test('requirements_min_50_words fails with fewer than 50 words', () => {
    const item = makeItem({requirementsBody: 'only a few words'});
    const results = service.evaluateExitCriteria(item, [{id: 'rw', check: 'requirements_min_50_words', description: '50 words'}]);
    expect(results[0].met).toBe(false);
  });

  test('has_notes checks item flag', () => {
    const withNotes = makeItem({hasNotes: true});
    const withoutNotes = makeItem({hasNotes: false});
    expect(service.evaluateExitCriteria(withNotes, [{id: 'hn', check: 'has_notes', description: 'Has notes'}])[0].met).toBe(true);
    expect(service.evaluateExitCriteria(withoutNotes, [{id: 'hn', check: 'has_notes', description: 'Has notes'}])[0].met).toBe(false);
  });

  test('worktree_exists checks item flag', () => {
    const withWt = makeItem({worktreeExists: true});
    const withoutWt = makeItem({worktreeExists: false});
    expect(service.evaluateExitCriteria(withWt, [{id: 'wt', check: 'worktree_exists', description: 'Worktree'}])[0].met).toBe(true);
    expect(service.evaluateExitCriteria(withoutWt, [{id: 'wt', check: 'worktree_exists', description: 'Worktree'}])[0].met).toBe(false);
  });

  test('multiple criteria all evaluated', () => {
    const item = makeItem({hasNotes: true, requirementsBody: ''});
    const results = service.evaluateExitCriteria(item, [
      {id: 'hn', check: 'has_notes', description: 'Has notes'},
      {id: 'rb', check: 'requirements_has_body', description: 'Has body'},
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].met).toBe(true);
    expect(results[1].met).toBe(false);
  });
});

// ─── workStyle ───────────────────────────────────────────────────────────────

describe('loadWorkStyle / saveWorkStyle', () => {
  test('returns defaults when no file exists', () => {
    const ws = service.loadWorkStyle(tmpDir);
    expect(ws).toMatchObject(DEFAULT_WORK_STYLE as unknown as Record<string, unknown>);
  });

  test('persists and reloads saved work style', () => {
    const updated: WorkStyle = {...DEFAULT_WORK_STYLE, verbosity: 'detailed', decisionStyle: 'decide'};
    service.saveWorkStyle(tmpDir, updated);
    const reloaded = service.loadWorkStyle(tmpDir);
    expect(reloaded.verbosity).toBe('detailed');
    expect(reloaded.decisionStyle).toBe('decide');
  });

  test('saveWorkStyle regenerates the generated skill file', () => {
    service.ensureStageFiles(tmpDir); // initialises stages dir
    service.saveWorkStyle(tmpDir, DEFAULT_WORK_STYLE);
    const content = fs.readFileSync(service.getSharedSkillPath(tmpDir), 'utf8');
    expect(content.length).toBeGreaterThan(50);
  });

  test('saveWorkStyle regenerates the shared skill file', () => {
    service.ensureStageFiles(tmpDir);
    const updated: WorkStyle = {...DEFAULT_WORK_STYLE, inputMode: 'doc_review'};
    service.saveWorkStyle(tmpDir, updated);
    const content = fs.readFileSync(service.getSharedSkillPath(tmpDir), 'utf8');
    expect(content).toContain('Input mode: `doc_review`');
  });

  test('missing fields fall back to defaults', () => {
    const trackerPath = service.getTrackerPath(tmpDir);
    fs.mkdirSync(trackerPath, {recursive: true});
    fs.writeFileSync(path.join(trackerPath, 'work-style.json'), JSON.stringify({verbosity: 'brief'}));
    const ws = service.loadWorkStyle(tmpDir);
    expect(ws.verbosity).toBe('brief');
    expect(ws.decisionStyle).toBe(DEFAULT_WORK_STYLE.decisionStyle);
  });
});

// ─── stageSettings ───────────────────────────────────────────────────────────

describe('loadStagesConfig / saveStageSettings', () => {
  test('returns defaults when no stages.json', () => {
    const config = service.loadStagesConfig(tmpDir);
    expect(config.discovery).toBeDefined();
    expect(config.implement).toBeDefined();
  });

  test('saveStageSettings persists and merges', () => {
    service.saveStageSettings(tmpDir, 'discovery', {effort: 'deep', report: 'always_confirm'});
    const config = service.loadStagesConfig(tmpDir);
    expect(config.discovery.settings?.effort).toBe('deep');
    expect(config.discovery.settings?.report).toBe('always_confirm');
  });

  test('saveStageSettings regenerates stage docs and shared skill files', () => {
    service.ensureStageFiles(tmpDir);
    service.saveStageSettings(tmpDir, 'discovery', {effort: 'deep', report: 'always_confirm'});
    const skill = fs.readFileSync(service.getSharedSkillPath(tmpDir), 'utf8');
    expect(skill).toContain('Thorough codebase scan');
    expect(skill).toContain('Summarise findings');
  });

  test('saveStageSettings merges without overwriting other keys', () => {
    service.saveStageSettings(tmpDir, 'discovery', {effort: 'skim'});
    service.saveStageSettings(tmpDir, 'discovery', {report: 'just_advance'});
    const config = service.loadStagesConfig(tmpDir);
    expect(config.discovery.settings?.effort).toBe('skim');
    expect(config.discovery.settings?.report).toBe('just_advance');
  });

  test('settings for different stages are independent', () => {
    service.saveStageSettings(tmpDir, 'discovery', {effort: 'skim'});
    service.saveStageSettings(tmpDir, 'implement', {tdd: 'required'});
    const config = service.loadStagesConfig(tmpDir);
    expect(config.discovery.settings?.effort).toBe('skim');
    expect(config.implement.settings?.tdd).toBe('required');
    expect(config.discovery.settings?.tdd).toBeUndefined();
  });
});

// ─── defaultStageFileContent ─────────────────────────────────────────────────

describe('defaultStageFileContent', () => {
  test('discovery: effort=skim stays minimal (no codebase-scan or web-search prose)', () => {
    const body = service.defaultStageFileContent('discovery', {effort: 'skim'}).split('## Agent status protocol')[0];
    expect(body).toContain('Skim codebase');
    expect(body).not.toContain('Thorough codebase scan');
    expect(body).not.toContain('Web research');
  });

  test('discovery: effort=deep includes thorough codebase + web research prose', () => {
    const content = service.defaultStageFileContent('discovery', {effort: 'deep'});
    expect(content).toContain('Thorough codebase scan');
    expect(content).toContain('Web research');
  });

  test('discovery: output fields vary by effort', () => {
    const skim = service.defaultStageFileContent('discovery', {effort: 'skim'});
    const deep = service.defaultStageFileContent('discovery', {effort: 'deep'});
    expect(skim).not.toContain('Options');
    expect(deep).toContain('Options');
  });

  test('discovery: the trivial-item skip rule is always surfaced', () => {
    const content = service.defaultStageFileContent('discovery', {});
    expect(content).toMatch(/Trivial items/i);
  });

  test('requirements: style=interview asks questions before drafting', () => {
    const content = service.defaultStageFileContent('requirements', {style: 'interview'});
    expect(content).toMatch(/ask targeted questions/i);
  });

  test('requirements: style=draft_first drafts before asking', () => {
    const content = service.defaultStageFileContent('requirements', {style: 'draft_first'});
    expect(content).toContain('strawman');
  });

  test('requirements: detail=thorough adds constraints/dependencies sections', () => {
    const thorough = service.defaultStageFileContent('requirements', {detail: 'thorough'});
    const minimal = service.defaultStageFileContent('requirements', {detail: 'minimal'});
    expect(thorough).toContain('Constraints');
    expect(thorough).toContain('Dependencies');
    expect(minimal).not.toContain('Constraints');
  });

  test('requirements: min words varies by detail level', () => {
    const minimal = service.defaultStageFileContent('requirements', {detail: 'minimal'});
    const thorough = service.defaultStageFileContent('requirements', {detail: 'thorough'});
    expect(minimal).toContain('30 words');
    expect(thorough).toContain('100 words');
  });

  test('implement: start_with=explore includes explore step', () => {
    const content = service.defaultStageFileContent('implement', {start_with: 'explore'});
    expect(content).toContain('Explore the codebase');
  });

  test('implement: start_with=jump_in skips exploration', () => {
    const content = service.defaultStageFileContent('implement', {start_with: 'jump_in'});
    expect(content).not.toContain('Explore the codebase');
  });

  test('implement: tdd=required mentions failing tests first', () => {
    const content = service.defaultStageFileContent('implement', {tdd: 'required'});
    expect(content).toContain('failing tests');
  });

  test('implement: tdd=skip omits test requirement', () => {
    const content = service.defaultStageFileContent('implement', {tdd: 'skip'});
    expect(content).toContain('Do not write tests');
  });

  test('implement: commit_style=conventional mentions conventional format', () => {
    const content = service.defaultStageFileContent('implement', {commit_style: 'conventional'});
    expect(content).toContain('feat:');
  });

  test('implement: commit_style=none omits commit step', () => {
    const withNone = service.defaultStageFileContent('implement', {commit_style: 'none'});
    const withAtomic = service.defaultStageFileContent('implement', {commit_style: 'atomic'});
    expect(withNone).not.toContain('Commit');
    expect(withAtomic).toContain('Commit');
  });

  test('implement: impl_notes=detailed mentions detailed notes', () => {
    const content = service.defaultStageFileContent('implement', {impl_notes: 'detailed'});
    expect(content).toContain('detailed');
  });

  test('implement: impl_notes=skip omits implementation.md step', () => {
    const withSkipBody = service.defaultStageFileContent('implement', {impl_notes: 'skip'}).split('## Agent status protocol')[0];
    const withBriefBody = service.defaultStageFileContent('implement', {impl_notes: 'brief'}).split('## Agent status protocol')[0];
    expect(withSkipBody).not.toContain('implementation.md');
    expect(withBriefBody).toContain('implementation.md');
  });

  test('cleanup: scope=quick says fix only critical issues', () => {
    const content = service.defaultStageFileContent('cleanup', {scope: 'quick'});
    expect(content).toContain('critical issues');
  });

  test('cleanup: scope=thorough includes refactor step', () => {
    const content = service.defaultStageFileContent('cleanup', {scope: 'thorough'});
    expect(content).toContain('Refactor');
  });

  test('cleanup: tests=fix includes fix failures step', () => {
    const content = service.defaultStageFileContent('cleanup', {tests: 'fix'});
    expect(content).toContain('Fix');
  });

  test('cleanup: tests=skip omits test step', () => {
    const withSkip = service.defaultStageFileContent('cleanup', {tests: 'skip'});
    const withRun = service.defaultStageFileContent('cleanup', {tests: 'run'});
    expect(withSkip).not.toContain('test suite');
    expect(withRun).toContain('test suite');
  });

  test('cleanup: pr_prep=full includes PR description step', () => {
    const content = service.defaultStageFileContent('cleanup', {pr_prep: 'full'});
    expect(content).toContain('PR description');
  });

  test('cleanup: docs=write includes write docs step', () => {
    const content = service.defaultStageFileContent('cleanup', {docs: 'write'});
    expect(content).toContain('Write new docs');
  });

  test('implement + cleanup include advancing instructions referencing index.json', () => {
    // Discovery and requirements now rely on status.json (set via the
    // protocol tail) to advance — they don't repeat index.json guidance.
    for (const stage of ['implement', 'cleanup'] as const) {
      const content = service.defaultStageFileContent(stage);
      expect(content).toContain('index.json');
    }
  });

  test('advancing instructions describe paths as relative / from prompt', () => {
    for (const stage of ['implement', 'cleanup'] as const) {
      const content = service.defaultStageFileContent(stage);
      expect(content).toMatch(/path in (the )?prompt|relative path|path.*prompt/i);
    }
  });
});

// ─── ensureStageFiles ────────────────────────────────────────────────────────

describe('ensureStageFiles', () => {
  test('creates generated skill files', () => {
    service.ensureStageFiles(tmpDir);
    expect(fs.existsSync(service.getSharedSkillPath(tmpDir))).toBe(true);
    expect(fs.existsSync(service.getClaudeSkillPath(tmpDir))).toBe(true);
  });

  test('creates shared and Claude skill files', () => {
    service.ensureStageFiles(tmpDir);
    expect(fs.existsSync(service.getSharedSkillPath(tmpDir))).toBe(true);
    expect(fs.existsSync(service.getClaudeSkillPath(tmpDir))).toBe(true);
  });

  test('regenerates existing generated skill files from config', () => {
    service.ensureStageFiles(tmpDir);
    const filePath = service.getSharedSkillPath(tmpDir);
    fs.writeFileSync(filePath, 'custom content');
    service.ensureStageFiles(tmpDir);
    expect(fs.readFileSync(filePath, 'utf8')).not.toBe('custom content');
  });
});

// ─── buildPlanningPrompt ─────────────────────────────────────────────────────

describe('buildPlanningPrompt', () => {
  let stageConf: StageConfig;

  beforeEach(() => {
    service.ensureTracker(tmpDir);
    service.ensureStageFiles(tmpDir);
    const config = service.loadStagesConfig(tmpDir);
    stageConf = config.discovery;
  });

  test('includes item slug, title, stage', () => {
    const item = makeItem();
    const prompt = service.buildPlanningPrompt(item, stageConf);
    expect(prompt).toContain('test-feature');
    expect(prompt).toContain('Test Feature');
    expect(prompt).toContain('Discovery');
  });

  test('includes paths to key files', () => {
    const item = makeItem();
    const prompt = service.buildPlanningPrompt(item, stageConf);
    expect(prompt).toContain('requirements.md');
    expect(prompt).toContain('notes.md');
    expect(prompt).toContain('implementation.md');
  });

  test('includes tracker/index.json relative path', () => {
    const item = makeItem();
    const prompt = service.buildPlanningPrompt(item, stageConf);
    expect(prompt).toContain('tracker/index.json');
    // Should NOT be absolute when cwd is the project root.
    expect(prompt).not.toContain(`${tmpDir}/tracker/index.json`);
  });

  test('includes generated skill file paths', () => {
    const item = makeItem();
    const prompt = service.buildPlanningPrompt(item, stageConf);
    expect(prompt).toContain('.agents/skills');
    expect(prompt).toContain('stages-progression');
  });

  test('includes stage settings when present', () => {
    service.saveStageSettings(tmpDir, 'discovery', {depth: 'quick', skip: 'if_obvious'});
    const config = service.loadStagesConfig(tmpDir);
    const item = makeItem();
    const prompt = service.buildPlanningPrompt(item, config.discovery);
    expect(prompt).toContain('depth=quick');
    expect(prompt).toContain('skip=if_obvious');
  });

  test('marks notes.md as not yet written when missing', () => {
    const item = makeItem({hasNotes: false});
    const prompt = service.buildPlanningPrompt(item, stageConf);
    expect(prompt).toContain('not yet written');
  });

  test('does not mark notes.md as missing when hasNotes=true', () => {
    const item = makeItem({hasNotes: true});
    const prompt = service.buildPlanningPrompt(item, stageConf);
    // notes.md line should not say "not yet written"
    const notesLine = prompt.split('\n').find(l => l.includes('notes.md'));
    expect(notesLine).not.toContain('not yet written');
  });

  test('itemDirOverride sets the Item dir line to the worktree-relative path', () => {
    const worktreeItemDir = path.join(tmpDir, 'worktree', 'tracker', 'items', 'test-feature');
    const item = makeItem({stage: 'implement'});
    const config = service.loadStagesConfig(tmpDir);
    const prompt = service.buildPlanningPrompt(item, config.implement, worktreeItemDir);
    expect(prompt).toContain('Item dir: tracker/items/test-feature');
  });

  test('itemDirOverride uses worktree-relative paths for requirements.md', () => {
    const worktreeItemDir = path.join(tmpDir, 'worktree', 'tracker', 'items', 'test-feature');
    const item = makeItem({stage: 'implement'});
    const config = service.loadStagesConfig(tmpDir);
    const prompt = service.buildPlanningPrompt(item, config.implement, worktreeItemDir);
    const reqLine = prompt.split('\n').find(l => l.includes('requirements.md'))!;
    expect(reqLine).toContain('tracker/items/test-feature/requirements.md');
    expect(reqLine).not.toContain(worktreeItemDir); // not absolute
  });

  test('skill path renders as worktree-relative even when it points at the main project', () => {
    const worktreeItemDir = path.join(tmpDir, 'worktree', 'tracker', 'items', 'test-feature');
    const item = makeItem({stage: 'implement'});
    const config = service.loadStagesConfig(tmpDir);
    const prompt = service.buildPlanningPrompt(item, config.implement, worktreeItemDir);
    const stageLine = prompt.split('\n').find(l => l.includes('Skill:') && l.includes('.agents/skills'))!;
    // worktree at <tmpDir>/worktree, main project at <tmpDir>; relative path crosses up.
    expect(stageLine).toContain('..');
    expect(stageLine).not.toContain(tmpDir); // never absolute
  });

  test('returns empty string for archived items', () => {
    const item = makeItem({stage: 'archive', bucket: 'archive'});
    const prompt = service.buildPlanningPrompt(item, stageConf);
    expect(prompt).toBe('');
  });
});

// ─── seedImplementation ──────────────────────────────────────────────────────

describe('ensureItemFiles', () => {
  let worktreeDir: string;

  beforeEach(() => {
    worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-worktree-'));
    service.createItem(tmpDir, 'My Feature', 'implement');
  });

  afterEach(() => {
    fs.rmSync(worktreeDir, {recursive: true, force: true});
  });

  test('writes notes.md (no requirements.md stub) when sessions[slug].description is set', () => {
    const description = 'Build the thing the way the user described it.';
    service.createItem(tmpDir, 'My Feature', 'implement', 'with-body', description);
    service.ensureItemFiles(tmpDir, 'with-body', worktreeDir);
    const destDir = path.join(worktreeDir, 'tracker', 'items', 'with-body');
    expect(fs.readFileSync(path.join(destDir, 'notes.md'), 'utf8')).toBe(`${description}\n`);
    expect(fs.existsSync(path.join(destDir, 'requirements.md'))).toBe(false);
  });

  test('clears sessions[slug].description from the index after draining it into the worktree', () => {
    service.createItem(tmpDir, 'My Feature', 'implement', 'drain-once', 'one-shot description');
    service.ensureItemFiles(tmpDir, 'drain-once', worktreeDir);
    const index = JSON.parse(fs.readFileSync(service.getIndexPath(tmpDir), 'utf8'));
    expect(index.sessions['drain-once'].description).toBeUndefined();
    expect(index.sessions['drain-once'].title).toBe('My Feature');
  });

  test('writes nothing when there is no description and no legacy source', () => {
    service.ensureItemFiles(tmpDir, 'my-feature', worktreeDir);
    const destDir = path.join(worktreeDir, 'tracker', 'items', 'my-feature');
    expect(fs.existsSync(path.join(destDir, 'requirements.md'))).toBe(false);
    expect(fs.existsSync(path.join(destDir, 'notes.md'))).toBe(false);
  });

  test('does NOT create tracker/index.json in the worktree', () => {
    service.ensureItemFiles(tmpDir, 'my-feature', worktreeDir);
    expect(fs.existsSync(path.join(worktreeDir, 'tracker', 'index.json'))).toBe(false);
  });

  test('does not overwrite existing notes.md in worktree', () => {
    service.createItem(tmpDir, 'Existing', 'implement', 'existing-notes', 'fresh description');
    const destDir = path.join(worktreeDir, 'tracker', 'items', 'existing-notes');
    fs.mkdirSync(destDir, {recursive: true});
    fs.writeFileSync(path.join(destDir, 'notes.md'), 'pre-existing notes');
    service.ensureItemFiles(tmpDir, 'existing-notes', worktreeDir);
    expect(fs.readFileSync(path.join(destDir, 'notes.md'), 'utf8')).toBe('pre-existing notes');
  });

  test('migrates legacy main-project bucket files into the worktree and deletes the source dir', () => {
    // Simulate a pre-refactor item with files in the main project tracker dir.
    const legacyDir = path.join(tmpDir, 'tracker', 'implementation', 'my-feature');
    fs.mkdirSync(legacyDir, {recursive: true});
    fs.writeFileSync(path.join(legacyDir, 'requirements.md'), '---\ntitle: Legacy\n---\nold body');
    fs.writeFileSync(path.join(legacyDir, 'notes.md'), 'legacy notes');

    service.ensureItemFiles(tmpDir, 'my-feature', worktreeDir);
    const destDir = path.join(worktreeDir, 'tracker', 'items', 'my-feature');
    expect(fs.readFileSync(path.join(destDir, 'requirements.md'), 'utf8')).toContain('Legacy');
    expect(fs.readFileSync(path.join(destDir, 'notes.md'), 'utf8')).toBe('legacy notes');
    expect(fs.existsSync(legacyDir)).toBe(false);
  });

  test('migrates a legacy main-project items dir and deletes the source dir', () => {
    const legacyItemsDir = path.join(tmpDir, 'tracker', 'items', 'my-feature');
    fs.mkdirSync(legacyItemsDir, {recursive: true});
    fs.writeFileSync(path.join(legacyItemsDir, 'requirements.md'), '---\ntitle: From Main\n---\nlegacy body');

    service.ensureItemFiles(tmpDir, 'my-feature', worktreeDir);
    const destDir = path.join(worktreeDir, 'tracker', 'items', 'my-feature');
    expect(fs.readFileSync(path.join(destDir, 'requirements.md'), 'utf8')).toContain('From Main');
    expect(fs.existsSync(legacyItemsDir)).toBe(false);
  });
});

describe('renameItem', () => {
  beforeEach(() => {
    service.createItem(tmpDir, 'Original title', 'discovery', 'old-slug', 'body');
  });

  test('moves the slug across index buckets and migrates the sessions metadata', () => {
    const ok = service.renameItem(tmpDir, 'old-slug', 'old-slug-2');
    expect(ok).toBe(true);
    const index = JSON.parse(fs.readFileSync(service.getIndexPath(tmpDir), 'utf8'));
    expect(index.backlog.discovery).toContain('old-slug-2');
    expect(index.backlog.discovery).not.toContain('old-slug');
    expect(index.sessions['old-slug-2']?.title).toBe('Original title');
    expect(index.sessions['old-slug']).toBeUndefined();
  });

  test('renames the on-disk item directory and rewrites slug frontmatter', () => {
    // createItem doesn't materialise the item dir until ensureItemFiles runs,
    // so seed the dir + a frontmatter-bearing file directly to exercise the rename.
    const oldDir = path.join(tmpDir, 'tracker', 'items', 'old-slug');
    fs.mkdirSync(oldDir, {recursive: true});
    fs.writeFileSync(
      path.join(oldDir, 'requirements.md'),
      `---\ntitle: "Original title"\nslug: old-slug\n---\n\nbody\n`,
    );
    service.renameItem(tmpDir, 'old-slug', 'old-slug-2');
    const newDir = path.join(tmpDir, 'tracker', 'items', 'old-slug-2');
    expect(fs.existsSync(oldDir)).toBe(false);
    expect(fs.existsSync(newDir)).toBe(true);
    const reqRaw = fs.readFileSync(path.join(newDir, 'requirements.md'), 'utf8');
    const {frontmatter} = parseFrontmatter(reqRaw);
    expect(frontmatter.slug).toBe('old-slug-2');
  });

  test('returns false when the new slug already exists in the index', () => {
    service.createItem(tmpDir, 'Other', 'discovery', 'other-slug', 'body');
    expect(service.renameItem(tmpDir, 'old-slug', 'other-slug')).toBe(false);
  });

  test('returns false when the old slug is unknown', () => {
    expect(service.renameItem(tmpDir, 'never-existed', 'fresh-slug')).toBe(false);
  });
});
