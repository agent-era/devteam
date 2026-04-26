import {describe, expect, test} from '@jest/globals';
import {getTrackerCardDisplayState} from '../../src/screens/TrackerBoardScreen.js';

describe('getTrackerCardDisplayState', () => {
  test('shows a subdued merged label and hides ready treatment after PR merge', () => {
    const display = getTrackerCardDisplayState({
      prMerged: true,
      readyToAdvance: false,
      isWaiting: false,
      isWorking: false,
      hasSession: false,
      inactive: false,
      itemStatusDescription: 'cleanup complete',
    });

    expect(display.statusGlyph).toBe('◆');
    expect(display.statusColor).toBe('gray');
    expect(display.titleColor).toBe('gray');
    expect(display.titleBold).toBe(false);
    expect(display.secondaryText).toBe('Merged');
    expect(display.secondaryColor).toBe('gray');
    expect(display.secondaryDim).toBe(true);
    expect(display.showApproveHint).toBe(false);
  });

  test('keeps ready-to-advance rendering for non-merged items', () => {
    const display = getTrackerCardDisplayState({
      prMerged: false,
      readyToAdvance: true,
      isWaiting: false,
      isWorking: false,
      hasSession: false,
      inactive: false,
      itemStatusDescription: 'review requirements',
    });

    expect(display.statusGlyph).toBe('✓');
    expect(display.statusColor).toBe('green');
    expect(display.titleColor).toBe('green');
    expect(display.titleBold).toBe(true);
    expect(display.secondaryText).toBe('Ready — review requirements');
    expect(display.secondaryColor).toBe('green');
    expect(display.secondaryBold).toBe(true);
    expect(display.showApproveHint).toBe(true);
  });
});
