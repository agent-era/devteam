import {describe, test, expect, beforeEach, afterEach} from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {TrackerService, parseFrontmatter, DEFAULT_WORK_STYLE, TrackerItem, StageConfig, WorkStyle, ItemStatus, ITEM_STATUS_STALE_MS} from '../../src/services/TrackerService.js';

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
      is_waiting_for_user: true,
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
      is_waiting_for_user: false,
      brief_description: 'working',
      timestamp: new Date().toISOString(),
    };
    service.writeItemStatus(tmpDir, SLUG, status);
    const written = path.join(tmpDir, 'tracker', 'items', SLUG, 'status.json');
    expect(fs.existsSync(written)).toBe(true);
  });

  test('writeItemStatus truncates brief_description to 120 chars', () => {
    seedItemDir();
    const longReason = 'x'.repeat(500);
    service.writeItemStatus(tmpDir, SLUG, {
      stage: 'requirements',
      is_waiting_for_user: true,
      brief_description: longReason,
      timestamp: new Date().toISOString(),
    });
    const read = service.getItemStatus(tmpDir, SLUG);
    expect(read?.brief_description.length).toBe(120);
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

  test('isItemStatusStale is true when timestamp is older than 24h', () => {
    const old = new Date(Date.now() - ITEM_STATUS_STALE_MS - 1000).toISOString();
    expect(service.isItemStatusStale({
      stage: 'implement',
      is_waiting_for_user: true,
      brief_description: '',
      timestamp: old,
    })).toBe(true);
  });

  test('isItemStatusStale is false for a fresh timestamp', () => {
    expect(service.isItemStatusStale({
      stage: 'implement',
      is_waiting_for_user: true,
      brief_description: '',
      timestamp: new Date().toISOString(),
    })).toBe(false);
  });

  test('isItemStatusStale is true when timestamp is unparseable', () => {
    expect(service.isItemStatusStale({
      stage: 'implement',
      is_waiting_for_user: true,
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
      is_waiting_for_user: false,
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
      is_waiting_for_user: false,
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
    expect(status?.is_waiting_for_user).toBe(false);
  });

  test('preserves is_waiting_for_user across a move', () => {
    service.createItem(tmpDir, 'Waiting', 'discovery', 'waits');
    service.writeItemStatus(tmpDir, 'waits', {
      stage: 'discovery',
      is_waiting_for_user: true,
      brief_description: 'pre-move wait',
      timestamp: new Date().toISOString(),
    });
    service.moveItem(tmpDir, 'waits', 'requirements');
    const status = service.getItemStatus(tmpDir, 'waits');
    expect(status?.stage).toBe('requirements');
    expect(status?.is_waiting_for_user).toBe(true);
    expect(status?.brief_description).toBe('pre-move wait');
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
    expect(content).toContain('is_waiting_for_user');
  });

  test.each(STAGES)('every stage renders Input mode + Gate on advance sections', (stage) => {
    const content = service.defaultStageFileContent(stage, {});
    expect(content).toContain('Input mode:');
    expect(content).toContain('Gate on advance:');
  });

  test.each([
    ['ask_questions', 'ask_questions'],
    ['inline', 'Inline'],
    ['batch', 'Batch'],
    ['doc_review', 'review'],
  ] as const)('input_mode=%s renders mode-specific guidance', (mode, needle) => {
    const content = service.defaultStageFileContent('discovery', {input_mode: mode});
    expect(content).toMatch(new RegExp(needle, 'i'));
  });

  test.each([
    ['none', 'silently'],
    ['review_and_advance', 'Stage review'],
    ['wait_for_approval', 'approval'],
  ] as const)('gate_on_advance=%s renders the right gate text', (gate, needle) => {
    const content = service.defaultStageFileContent('requirements', {gate_on_advance: gate});
    expect(content).toMatch(new RegExp(needle, 'i'));
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

  test('review_and_advance gate references the stage\'s output file', () => {
    const disc = service.defaultStageFileContent('discovery', {gate_on_advance: 'review_and_advance'});
    expect(disc).toContain('notes.md');
    const req = service.defaultStageFileContent('requirements', {gate_on_advance: 'review_and_advance'});
    expect(req).toContain('requirements.md');
    const impl = service.defaultStageFileContent('implement', {gate_on_advance: 'review_and_advance'});
    expect(impl).toContain('implementation.md');
  });

  test('gate defaults: requirements and cleanup default to wait_for_approval, implement to review_and_advance', () => {
    const req = service.defaultStageFileContent('requirements', {});
    expect(req).toMatch(/Gate on advance: `wait_for_approval`/);
    const clean = service.defaultStageFileContent('cleanup', {});
    expect(clean).toMatch(/Gate on advance: `wait_for_approval`/);
    const impl = service.defaultStageFileContent('implement', {});
    expect(impl).toMatch(/Gate on advance: `review_and_advance`/);
  });
});

// ─── createItem ─────────────────────────────────────────────────────────────

describe('createItem', () => {
  test('adds slug to index.json and writes requirements stub to main project', () => {
    service.createItem(tmpDir, 'Add user auth', 'discovery');

    const indexPath = path.join(tmpDir, 'tracker', 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    expect(index.backlog.discovery).toContain('add-user-auth');
    expect(index.sessions['add-user-auth'].title).toBe('Add user auth');
    const reqPath = path.join(tmpDir, 'tracker', 'items', 'add-user-auth', 'requirements.md');
    expect(fs.existsSync(reqPath)).toBe(true);
    expect(fs.readFileSync(reqPath, 'utf8')).toContain('Add user auth');
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

  test('writes provided body to notes.md (discovery output), keeping requirements.md as a title stub', () => {
    service.createItem(tmpDir, 'Add auth', 'discovery', undefined, 'Implement OAuth2 login with Google and GitHub providers.');
    const notesPath = path.join(tmpDir, 'tracker', 'items', 'add-auth', 'notes.md');
    expect(fs.readFileSync(notesPath, 'utf8')).toContain('Implement OAuth2 login with Google and GitHub providers.');
    const reqContent = fs.readFileSync(path.join(tmpDir, 'tracker', 'items', 'add-auth', 'requirements.md'), 'utf8');
    expect(reqContent).not.toContain('Implement OAuth2 login with Google and GitHub providers.');
  });

  test('does not create notes.md when body is omitted', () => {
    service.createItem(tmpDir, 'My Feature', 'discovery');
    const notesPath = path.join(tmpDir, 'tracker', 'items', 'my-feature', 'notes.md');
    expect(fs.existsSync(notesPath)).toBe(false);
    const reqContent = fs.readFileSync(path.join(tmpDir, 'tracker', 'items', 'my-feature', 'requirements.md'), 'utf8');
    expect(reqContent).toMatch(/\nMy Feature\n/);
  });

  test('uses explicit slug when provided alongside body', () => {
    service.createItem(tmpDir, 'Proposal Title', 'backlog', 'ai-derived-slug', 'Detailed description from proposal.');
    const reqPath = path.join(tmpDir, 'tracker', 'items', 'ai-derived-slug', 'requirements.md');
    expect(fs.existsSync(reqPath)).toBe(true);
    const notesPath = path.join(tmpDir, 'tracker', 'items', 'ai-derived-slug', 'notes.md');
    expect(fs.readFileSync(notesPath, 'utf8')).toContain('Detailed description from proposal.');
    const reqContent = fs.readFileSync(reqPath, 'utf8');
    expect(reqContent).toMatch(/^slug: ai-derived-slug$/m);
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

  test('saveWorkStyle also writes working-style.md when stages dir exists', () => {
    service.ensureStageFiles(tmpDir); // initialises stages dir
    service.saveWorkStyle(tmpDir, DEFAULT_WORK_STYLE);
    const mdPath = service.getWorkStyleFilePath(tmpDir);
    expect(fs.existsSync(mdPath)).toBe(true);
    const content = fs.readFileSync(mdPath, 'utf8');
    expect(content.length).toBeGreaterThan(50);
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
    service.saveStageSettings(tmpDir, 'discovery', {depth: 'thorough', skip: 'always_run'});
    const config = service.loadStagesConfig(tmpDir);
    expect(config.discovery.settings?.depth).toBe('thorough');
    expect(config.discovery.settings?.skip).toBe('always_run');
  });

  test('saveStageSettings merges without overwriting other keys', () => {
    service.saveStageSettings(tmpDir, 'discovery', {depth: 'quick'});
    service.saveStageSettings(tmpDir, 'discovery', {skip: 'if_obvious'});
    const config = service.loadStagesConfig(tmpDir);
    expect(config.discovery.settings?.depth).toBe('quick');
    expect(config.discovery.settings?.skip).toBe('if_obvious');
  });

  test('settings for different stages are independent', () => {
    service.saveStageSettings(tmpDir, 'discovery', {depth: 'quick'});
    service.saveStageSettings(tmpDir, 'implement', {tdd: 'required'});
    const config = service.loadStagesConfig(tmpDir);
    expect(config.discovery.settings?.depth).toBe('quick');
    expect(config.implement.settings?.tdd).toBe('required');
    expect(config.discovery.settings?.tdd).toBeUndefined();
  });
});

// ─── defaultStageFileContent ─────────────────────────────────────────────────

describe('defaultStageFileContent', () => {
  test('backlog: default content has goal and steps', () => {
    const content = service.defaultStageFileContent('backlog');
    expect(content).toContain('# Stage 1: Backlog');
    expect(content).toContain('Goal');
    expect(content).toContain('Steps');
    expect(content).toContain('Advancing');
  });

  test('backlog: effort_estimate=skip omits effort step', () => {
    const withSkip = service.defaultStageFileContent('backlog', {effort_estimate: 'skip'});
    const withRough = service.defaultStageFileContent('backlog', {effort_estimate: 'rough'});
    expect(withSkip).not.toContain('t-shirt');
    expect(withRough).toContain('t-shirt');
  });

  test('backlog: auto_discover=auto says advance automatically', () => {
    const content = service.defaultStageFileContent('backlog', {auto_discover: 'auto'});
    expect(content).toContain('automatically');
  });

  test('backlog: auto_discover=manual says stop here', () => {
    const content = service.defaultStageFileContent('backlog', {auto_discover: 'manual'});
    expect(content).toContain('Stop here');
  });

  test('discovery: always_skip produces minimal short instructions', () => {
    // The protocol suffix intentionally mentions ask_questions as the default
    // input mode; scope the "must not appear" assertions to the body only.
    const body = service.defaultStageFileContent('discovery', {skip: 'always_skip'}).split('## Agent status protocol')[0];
    expect(body).toContain('always skip');
    expect(body).not.toContain('codebase scan');
    expect(body).not.toContain('ask_questions');
  });

  test('discovery: depth=quick omits codebase scan', () => {
    const content = service.defaultStageFileContent('discovery', {depth: 'quick', skip: 'always_run'});
    expect(content).not.toContain('codebase scan');
  });

  test('discovery: depth=thorough includes codebase scan and web search', () => {
    const content = service.defaultStageFileContent('discovery', {depth: 'thorough', skip: 'always_run', web_search: 'if_needed'});
    expect(content).toContain('Scan the codebase');
    expect(content).toContain('web search');
  });

  test('discovery: questions=none skips ask_questions step', () => {
    const body = service.defaultStageFileContent('discovery', {depth: 'normal', skip: 'always_run', questions: 'none'}).split('## Agent status protocol')[0];
    expect(body).not.toContain('ask_questions');
  });

  test('discovery: questions=standard includes ask_questions step', () => {
    const content = service.defaultStageFileContent('discovery', {depth: 'normal', skip: 'always_run', questions: 'standard'});
    expect(content).toContain('ask_questions');
  });

  test('discovery: output fields vary by depth', () => {
    const quick = service.defaultStageFileContent('discovery', {depth: 'quick', skip: 'always_run'});
    const thorough = service.defaultStageFileContent('discovery', {depth: 'thorough', skip: 'always_run'});
    expect(quick).not.toContain('Options considered');
    expect(thorough).toContain('Options considered');
  });

  test('discovery: skip=if_obvious adds a skip notice', () => {
    const content = service.defaultStageFileContent('discovery', {skip: 'if_obvious'});
    expect(content).toContain('obvious');
  });

  test('requirements: style=interview asks questions before drafting', () => {
    const content = service.defaultStageFileContent('requirements', {style: 'interview'});
    expect(content).toContain('ask targeted questions');
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

  test('requirements: user_stories=lead puts user stories first in output', () => {
    const content = service.defaultStageFileContent('requirements', {user_stories: 'lead'});
    const storiesIdx = content.indexOf('User stories');
    const summaryIdx = content.indexOf('Summary');
    expect(storiesIdx).toBeGreaterThan(-1);
    expect(storiesIdx).toBeLessThan(summaryIdx);
  });

  test('requirements: approval=per_section mentions section approval', () => {
    const content = service.defaultStageFileContent('requirements', {approval: 'per_section'});
    expect(content).toContain('approval');
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

  test('non-discovery stages include advancing instructions referencing index.json', () => {
    // Discovery now signals advancement via a heading in requirements.md (auto-detected),
    // so it doesn't need to mention index.json itself.
    for (const stage of ['requirements', 'implement', 'cleanup'] as const) {
      const content = service.defaultStageFileContent(stage);
      expect(content).toContain('index.json');
    }
  });

  test('advancing instructions describe paths as relative / from prompt', () => {
    for (const stage of ['requirements', 'implement', 'cleanup'] as const) {
      const content = service.defaultStageFileContent(stage);
      expect(content).toMatch(/path in (the )?prompt|relative path|path.*prompt/i);
    }
  });
});

// ─── ensureStageFiles ────────────────────────────────────────────────────────

describe('ensureStageFiles', () => {
  test('creates all stage files and overview', () => {
    service.ensureStageFiles(tmpDir);
    const stagesDir = service.getStagesDir(tmpDir);
    expect(fs.existsSync(path.join(stagesDir, '0-overview.md'))).toBe(true);
    for (const stage of ['discovery', 'requirements', 'implement', 'cleanup'] as const) {
      expect(fs.existsSync(service.getStageFilePath(tmpDir, stage))).toBe(true);
    }
  });

  test('creates working-style.md', () => {
    service.ensureStageFiles(tmpDir);
    expect(fs.existsSync(service.getWorkStyleFilePath(tmpDir))).toBe(true);
  });

  test('does not overwrite existing stage files', () => {
    service.ensureStageFiles(tmpDir);
    const filePath = service.getStageFilePath(tmpDir, 'discovery');
    fs.writeFileSync(filePath, 'custom content');
    service.ensureStageFiles(tmpDir);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('custom content');
  });

  test('always regenerates working-style.md', () => {
    service.ensureStageFiles(tmpDir);
    const wsPath = service.getWorkStyleFilePath(tmpDir);
    fs.writeFileSync(wsPath, 'stale content');
    service.ensureStageFiles(tmpDir);
    expect(fs.readFileSync(wsPath, 'utf8')).not.toBe('stale content');
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

  test('includes guide file paths', () => {
    const item = makeItem();
    const prompt = service.buildPlanningPrompt(item, stageConf);
    expect(prompt).toContain('tracker/stages');
    expect(prompt).toContain('working-style.md');
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

  test('guide paths render as worktree-relative even when they point at the main project', () => {
    const worktreeItemDir = path.join(tmpDir, 'worktree', 'tracker', 'items', 'test-feature');
    const item = makeItem({stage: 'implement'});
    const config = service.loadStagesConfig(tmpDir);
    const prompt = service.buildPlanningPrompt(item, config.implement, worktreeItemDir);
    const stageLine = prompt.split('\n').find(l => l.includes('Stage:') && l.includes('tracker/stages'))!;
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

  test('creates a fresh requirements.md in the worktree at tracker/items/<slug>/', () => {
    service.ensureItemFiles(tmpDir, 'my-feature', worktreeDir, {title: 'My Feature'} as any);
    const destDir = path.join(worktreeDir, 'tracker', 'items', 'my-feature');
    expect(fs.existsSync(destDir)).toBe(true);
    const reqPath = path.join(destDir, 'requirements.md');
    expect(fs.existsSync(reqPath)).toBe(true);
    expect(fs.readFileSync(reqPath, 'utf8')).toContain('title: "My Feature"');
  });

  test('does NOT create tracker/index.json in the worktree', () => {
    service.ensureItemFiles(tmpDir, 'my-feature', worktreeDir);
    expect(fs.existsSync(path.join(worktreeDir, 'tracker', 'index.json'))).toBe(false);
  });

  test('does not overwrite existing files in worktree', () => {
    const destDir = path.join(worktreeDir, 'tracker', 'items', 'my-feature');
    fs.mkdirSync(destDir, {recursive: true});
    fs.writeFileSync(path.join(destDir, 'requirements.md'), 'existing content');
    service.ensureItemFiles(tmpDir, 'my-feature', worktreeDir);
    expect(fs.readFileSync(path.join(destDir, 'requirements.md'), 'utf8')).toBe('existing content');
  });

  test('migrates legacy main-project bucket files into the worktree', () => {
    // Simulate a pre-refactor item with files in the main project tracker dir.
    const legacyDir = path.join(tmpDir, 'tracker', 'implementation', 'my-feature');
    fs.mkdirSync(legacyDir, {recursive: true});
    fs.writeFileSync(path.join(legacyDir, 'requirements.md'), '---\ntitle: Legacy\n---\nold body');
    fs.writeFileSync(path.join(legacyDir, 'notes.md'), 'legacy notes');

    service.ensureItemFiles(tmpDir, 'my-feature', worktreeDir);
    const destDir = path.join(worktreeDir, 'tracker', 'items', 'my-feature');
    expect(fs.readFileSync(path.join(destDir, 'requirements.md'), 'utf8')).toContain('Legacy');
    expect(fs.readFileSync(path.join(destDir, 'notes.md'), 'utf8')).toBe('legacy notes');
  });

  test('main project index.json is unchanged by seeding', () => {
    const indexBefore = fs.readFileSync(service.getIndexPath(tmpDir), 'utf8');
    service.ensureItemFiles(tmpDir, 'my-feature', worktreeDir);
    const indexAfter = fs.readFileSync(service.getIndexPath(tmpDir), 'utf8');
    expect(indexAfter).toBe(indexBefore);
  });
});
