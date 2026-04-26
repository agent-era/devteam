import {describe, expect, test} from '@jest/globals';
import {getTrackerCardDisplayState} from '../../src/screens/TrackerBoardScreen.js';

const baseFlags = {
  prMerged: false,
  readyToAdvance: false,
  isWaiting: false,
  isWorking: false,
  hasSession: false,
  inactive: false,
};

describe('getTrackerCardDisplayState', () => {
  test('shows a subdued merged label and hides ready treatment after PR merge', () => {
    const display = getTrackerCardDisplayState({
      ...baseFlags,
      prMerged: true,
      itemStatusDescription: 'cleanup complete',
    });

    expect(display).toMatchObject({
      statusGlyph: '◆',
      statusColor: 'gray',
      titleColor: 'gray',
      titleBold: false,
      secondaryText: 'Merged',
      secondaryColor: 'gray',
      secondaryBold: false,
      secondaryDim: true,
      showApproveHint: false,
    });
  });

  test('keeps ready-to-advance rendering for non-merged items', () => {
    const display = getTrackerCardDisplayState({
      ...baseFlags,
      readyToAdvance: true,
      itemStatusDescription: 'review requirements',
    });

    expect(display).toMatchObject({
      statusGlyph: '✓',
      statusColor: 'green',
      titleColor: 'green',
      titleBold: true,
      secondaryText: 'Ready — review requirements',
      secondaryColor: 'green',
      secondaryBold: true,
      secondaryDim: false,
      showApproveHint: true,
    });
  });

  test('waiting item uses yellow throughout', () => {
    const display = getTrackerCardDisplayState({
      ...baseFlags,
      isWaiting: true,
      itemStatusDescription: 'needs your input',
    });

    expect(display).toMatchObject({
      statusGlyph: '!',
      statusColor: 'yellow',
      titleColor: 'yellow',
      titleBold: true,
      secondaryText: 'needs your input',
      secondaryColor: 'yellow',
      secondaryBold: true,
      secondaryDim: false,
      showApproveHint: false,
    });
  });

  test('merged state takes precedence over ready-to-advance', () => {
    const display = getTrackerCardDisplayState({
      ...baseFlags,
      prMerged: true,
      readyToAdvance: true,
      itemStatusDescription: 'should be ignored',
    });

    expect(display.secondaryText).toBe('Merged');
    expect(display.statusColor).toBe('gray');
    expect(display.showApproveHint).toBe(false);
  });

  test('working item uses cyan with no title color', () => {
    const display = getTrackerCardDisplayState({
      ...baseFlags,
      isWorking: true,
      itemStatusDescription: 'compiling',
    });

    expect(display).toMatchObject({
      statusGlyph: '⟳',
      statusColor: 'cyan',
      titleColor: undefined,
      titleBold: false,
      secondaryText: 'compiling',
      secondaryColor: 'cyan',
      secondaryBold: false,
      secondaryDim: false,
      showApproveHint: false,
    });
  });

  test('session-only item is dim with no secondary color', () => {
    const display = getTrackerCardDisplayState({
      ...baseFlags,
      hasSession: true,
    });

    expect(display).toMatchObject({
      statusGlyph: '◆',
      statusColor: 'gray',
      titleColor: undefined,
      secondaryText: 'session idle',
      secondaryColor: undefined,
      secondaryDim: true,
      showApproveHint: false,
    });
  });

  test('idle item has empty secondary text', () => {
    const display = getTrackerCardDisplayState({...baseFlags});

    expect(display).toMatchObject({
      statusGlyph: ' ',
      statusColor: undefined,
      titleColor: undefined,
      secondaryText: '',
      secondaryColor: undefined,
      secondaryDim: true,
    });
  });

  test('inactive overrides force gray secondary and suppress bold', () => {
    const display = getTrackerCardDisplayState({
      ...baseFlags,
      readyToAdvance: true,
      inactive: true,
      itemStatusDescription: 'review requirements',
    });

    expect(display).toMatchObject({
      titleColor: 'green',
      secondaryColor: 'gray',
      secondaryBold: false,
      secondaryDim: true,
      showApproveHint: true,
    });
  });

  test('inactive working item is gray and dim', () => {
    const display = getTrackerCardDisplayState({
      ...baseFlags,
      isWorking: true,
      inactive: true,
    });

    expect(display).toMatchObject({
      statusColor: 'cyan',
      titleColor: 'gray',
      secondaryColor: 'gray',
      secondaryDim: true,
    });
  });

  test('inactive waiting item is gray and dim', () => {
    const display = getTrackerCardDisplayState({
      ...baseFlags,
      isWaiting: true,
      inactive: true,
    });

    expect(display).toMatchObject({
      titleColor: 'yellow',
      secondaryColor: 'gray',
      secondaryBold: false,
      secondaryDim: true,
    });
  });
});
