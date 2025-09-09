import {describe, test, expect} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {simulateTimeDelay} from '../utils/testHelpers.js';

describe('ProjectPickerDialog input behavior (<=3 projects)', () => {
  test('typing should not change selection or output', async () => {
    const {setUIMode, lastFrame, sendInput} = renderTestApp();
    await simulateTimeDelay(50);

    setUIMode('pickProjectForBranch', {
      projects: [
        {name: 'proj-1', path: '/fake/projects/proj-1'},
        {name: 'proj-2', path: '/fake/projects/proj-2'},
        {name: 'proj-3', path: '/fake/projects/proj-3'}
      ],
      defaultProject: 'proj-1',
      selectedIndex: 0
    });

    await simulateTimeDelay(50);
    const initial = lastFrame();
    expect(initial).toContain('Select Project');
    expect(initial).not.toContain('Filter:');
    expect(initial).toContain('proj-1');
    expect(initial).toContain('proj-2');
    expect(initial).toContain('proj-3');

    // Typing letters should not change output (filter disabled for <=3)
    sendInput('a');
    await simulateTimeDelay(20);
    expect(lastFrame()).toBe(initial);

    sendInput('b');
    await simulateTimeDelay(20);
    expect(lastFrame()).toBe(initial);

    // Navigation via arrows still works in real app (not simulated here)
  });
});
