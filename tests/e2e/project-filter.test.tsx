import {describe, beforeEach, test, expect} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {resetTestData, setupBasicProject, simulateTimeDelay} from '../utils/testHelpers.js';

describe('Project Filter Visibility E2E', () => {
  beforeEach(() => {
    resetTestData();
  });

  test('should not show project filter when 3 or fewer projects', async () => {
    // Setup: 3 projects
    setupBasicProject('proj-1');
    setupBasicProject('proj-2');
    setupBasicProject('proj-3');

    const {setUIMode, lastFrame} = renderTestApp();
    await simulateTimeDelay(50);

    setUIMode('pickProjectForBranch', {
      projects: [
        {name: 'proj-1', path: '/fake/projects/proj-1'},
        {name: 'proj-2', path: '/fake/projects/proj-2'},
        {name: 'proj-3', path: '/fake/projects/proj-3'}
      ],
      defaultProject: 'proj-1'
    });

    await simulateTimeDelay(50);

    const output = lastFrame();
    expect(output).toContain('Select Project');
    expect(output).toContain('proj-1');
    expect(output).toContain('proj-2');
    expect(output).toContain('proj-3');
    expect(output).not.toContain('Type to filter');
    expect(output).not.toContain('Filter:');
  });

  test('should show project filter when more than 3 projects', async () => {
    // Setup: 4 projects
    setupBasicProject('proj-1');
    setupBasicProject('proj-2');
    setupBasicProject('proj-3');
    setupBasicProject('proj-4');

    const {setUIMode, lastFrame} = renderTestApp();
    await simulateTimeDelay(50);

    setUIMode('pickProjectForBranch', {
      projects: [
        {name: 'proj-1', path: '/fake/projects/proj-1'},
        {name: 'proj-2', path: '/fake/projects/proj-2'},
        {name: 'proj-3', path: '/fake/projects/proj-3'},
        {name: 'proj-4', path: '/fake/projects/proj-4'}
      ],
      defaultProject: 'proj-1'
    });

    await simulateTimeDelay(50);

    const output = lastFrame();
    expect(output).toContain('Select Project');
    expect(output).toContain('proj-4');
    expect(output).toContain('Type to filter');
    expect(output).toContain('Filter:');
  });
});

