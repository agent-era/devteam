import {describe, expect, test} from '@jest/globals';
import {computeCardStatusFlags, getTrackerCardDisplayState, isItemPRMerged} from '../../src/screens/TrackerBoardScreen.js';
import {PRStatus, WorktreeInfo} from '../../src/models.js';

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

  test('session-only item collapses to the idle/empty branch (chips below the card carry the session signal)', () => {
    const display = getTrackerCardDisplayState({
      ...baseFlags,
      hasSession: true,
    });

    expect(display).toMatchObject({
      statusGlyph: ' ',
      statusColor: undefined,
      titleColor: undefined,
      secondaryText: '',
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

describe('isItemPRMerged', () => {
  // PR data is keyed by worktree path on GitHubContext.pullRequests, NOT on the
  // WorktreeInfo object. Two prior fixes (PR #221, PR #224) shipped reading
  // wt.pr.is_merged and silently failed because that field was never assigned.
  // These tests pin the lookup path so it can't drift back.
  const wt = new WorktreeInfo({
    project: 'demo',
    feature: 'login-flow',
    path: '/fake/projects/demo-branches/login-flow',
  });

  test('returns true when GitHubContext has a merged PR for the worktree path', () => {
    const prs = {[wt.path]: new PRStatus({state: 'MERGED'})};
    expect(isItemPRMerged(wt, prs)).toBe(true);
  });

  test('returns false when the matching PR is open', () => {
    const prs = {[wt.path]: new PRStatus({state: 'OPEN'})};
    expect(isItemPRMerged(wt, prs)).toBe(false);
  });

  test('returns false when no PR entry exists for the worktree path', () => {
    expect(isItemPRMerged(wt, {})).toBe(false);
  });

  test('returns false when the worktree itself is null (orphan/missing)', () => {
    const prs = {[wt.path]: new PRStatus({state: 'MERGED'})};
    expect(isItemPRMerged(null, prs)).toBe(false);
  });

  test('does not consult WorktreeInfo for PR data — only the pullRequests map', () => {
    // Sanity check: even if someone later re-introduces a `pr` field by mistake,
    // this helper must keep reading from the map.
    const wtWithStrayPr = new WorktreeInfo({...wt});
    (wtWithStrayPr as any).pr = new PRStatus({state: 'MERGED'});
    expect(isItemPRMerged(wtWithStrayPr, {})).toBe(false);
  });
});

describe('computeCardStatusFlags', () => {
  test('live working overrides file-based waiting_for_input (yellow → cyan)', () => {
    const flags = computeCardStatusFlags({
      aiStatus: 'working',
      prMerged: false,
      freshWaiting: true,
      freshReady: false,
    });

    expect(flags).toEqual({
      readyToAdvance: false,
      isWaiting: false,
      isWorking: true,
      hasSession: true,
    });
  });

  test('live working overrides file-based waiting_for_approval (green → cyan, no [m] hint)', () => {
    const flags = computeCardStatusFlags({
      aiStatus: 'working',
      prMerged: false,
      freshWaiting: true,
      freshReady: true,
    });

    expect(flags).toEqual({
      readyToAdvance: false,
      isWaiting: false,
      isWorking: true,
      hasSession: true,
    });
  });

  test('live "active" treated as working and overrides file waiting', () => {
    const flags = computeCardStatusFlags({
      aiStatus: 'active',
      prMerged: false,
      freshWaiting: true,
      freshReady: false,
    });

    expect(flags.isWorking).toBe(true);
    expect(flags.isWaiting).toBe(false);
    expect(flags.readyToAdvance).toBe(false);
  });

  test('live "waiting" (consent gate) keeps card yellow regardless of file state', () => {
    const flags = computeCardStatusFlags({
      aiStatus: 'waiting',
      prMerged: false,
      freshWaiting: false,
      freshReady: false,
    });

    expect(flags).toEqual({
      readyToAdvance: false,
      isWaiting: true,
      isWorking: false,
      hasSession: true,
    });
  });

  test('no session + file waiting_for_input renders yellow', () => {
    const flags = computeCardStatusFlags({
      aiStatus: undefined,
      prMerged: false,
      freshWaiting: true,
      freshReady: false,
    });

    expect(flags).toEqual({
      readyToAdvance: false,
      isWaiting: true,
      isWorking: false,
      hasSession: false,
    });
  });

  test('no session + file waiting_for_approval renders green ready-to-advance', () => {
    const flags = computeCardStatusFlags({
      aiStatus: undefined,
      prMerged: false,
      freshWaiting: true,
      freshReady: true,
    });

    expect(flags).toEqual({
      readyToAdvance: true,
      isWaiting: false,
      isWorking: false,
      hasSession: false,
    });
  });

  test('not_running session reports hasSession=false', () => {
    const flags = computeCardStatusFlags({
      aiStatus: 'not_running',
      prMerged: false,
      freshWaiting: false,
      freshReady: false,
    });

    expect(flags).toEqual({
      readyToAdvance: false,
      isWaiting: false,
      isWorking: false,
      hasSession: false,
    });
  });

  test('prMerged suppresses readyToAdvance even when file says waiting_for_approval', () => {
    const flags = computeCardStatusFlags({
      aiStatus: undefined,
      prMerged: true,
      freshWaiting: true,
      freshReady: true,
    });

    expect(flags.readyToAdvance).toBe(false);
  });

  test('idle session with no item status produces empty flags', () => {
    const flags = computeCardStatusFlags({
      aiStatus: 'idle',
      prMerged: false,
      freshWaiting: false,
      freshReady: false,
    });

    expect(flags).toEqual({
      readyToAdvance: false,
      isWaiting: false,
      isWorking: false,
      hasSession: true,
    });
  });
});
