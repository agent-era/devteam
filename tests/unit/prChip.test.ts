import {describe, test, expect} from '@jest/globals';
import {computePRChip} from '../../src/screens/prChip.js';
import {PRStatus} from '../../src/models.js';

const pr = (init: Partial<PRStatus>) => new PRStatus(init);

describe('computePRChip', () => {
  test('null/undefined → null', () => {
    expect(computePRChip(null)).toBeNull();
    expect(computePRChip(undefined)).toBeNull();
  });

  test('PR not yet checked → null', () => {
    expect(computePRChip(pr({loadingStatus: 'not_checked'}))).toBeNull();
  });

  test('PR loading → null', () => {
    expect(computePRChip(pr({loadingStatus: 'loading', number: 1}))).toBeNull();
  });

  test('exists but no number → null', () => {
    expect(computePRChip(pr({loadingStatus: 'exists', number: null}))).toBeNull();
  });

  test('open + passing checks → green chip', () => {
    expect(computePRChip(pr({loadingStatus: 'exists', number: 42, state: 'OPEN', checks: 'passing', mergeable: 'MERGEABLE'})))
      .toEqual({label: 'PR 42✓', color: 'green'});
  });

  test('failing checks → red chip', () => {
    expect(computePRChip(pr({loadingStatus: 'exists', number: 99, state: 'OPEN', checks: 'failing'})))
      .toEqual({label: 'PR 99x', color: 'red'});
  });

  test('conflicts → red chip', () => {
    const chip = computePRChip(pr({loadingStatus: 'exists', number: 7, state: 'OPEN', checks: 'passing', mergeable: 'CONFLICTING'}));
    expect(chip).toMatchObject({color: 'red'});
  });

  test('pending checks → yellow chip', () => {
    expect(computePRChip(pr({loadingStatus: 'exists', number: 8, state: 'OPEN', checks: 'pending'})))
      .toEqual({label: 'PR 8*', color: 'yellow'});
  });

  test('merged → gray chip with merged badge', () => {
    expect(computePRChip(pr({loadingStatus: 'exists', number: 5, state: 'MERGED', checks: 'passing'})))
      .toEqual({label: 'PR 5⟫', color: 'gray'});
  });

  test('open with no check info → gray fallback', () => {
    expect(computePRChip(pr({loadingStatus: 'exists', number: 3, state: 'OPEN'})))
      .toEqual({label: 'PR 3', color: 'gray'});
  });
});
