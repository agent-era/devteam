import {describe, test, expect} from '@jest/globals';
import {buildActions} from '../../src/screens/TrackerItemScreen.js';
import {TrackerService, type TrackerItem, type StagesConfig} from '../../src/services/TrackerService.js';

function makeItem(stage: TrackerItem['stage'], bucket: TrackerItem['bucket']): TrackerItem {
  return {
    slug: 'x',
    title: 'X',
    project: 'proj',
    projectPath: '/tmp/proj',
    bucket,
    stage,
    itemDir: '/tmp/proj/tracker/items/x',
    requirementsPath: '/tmp/proj/tracker/items/x/requirements.md',
    implementationPath: '/tmp/proj/tracker/items/x/implementation.md',
    notesPath: '/tmp/proj/tracker/items/x/notes.md',
    requirementsBody: '',
    frontmatter: {title: 'X', slug: 'x'},
    hasImplementationNotes: false,
    hasNotes: false,
    worktreeExists: false,
  };
}

describe('TrackerItemScreen buildActions', () => {
  const service = new TrackerService();
  const stagesConfig = service.loadStagesConfig('/tmp/proj') as Required<StagesConfig>;

  test('first action attaches to the session — no prompt-sending "Start X session" button', () => {
    const item = makeItem('discovery', 'backlog');
    const actions = buildActions(item, stagesConfig, service, []);

    expect(actions[0]).toEqual({id: 'attach-session', label: 'Attach session'});
    // Regression guard: the old prompt-sending button must not come back.
    expect(actions.some(a => /^Start .* session$/i.test(a.label))).toBe(false);
    expect(actions.some(a => a.id === 'current-stage')).toBe(false);
  });

  test('stage-advance action is still present alongside Attach session for non-terminal stages', () => {
    const item = makeItem('discovery', 'backlog');
    const actions = buildActions(item, stagesConfig, service, []);

    expect(actions.map(a => a.id)).toEqual(['attach-session', 'stage-action']);
  });

  test('archived items get no actions', () => {
    const item = makeItem('archive', 'archive');
    expect(buildActions(item, stagesConfig, service, [])).toEqual([]);
  });
});
