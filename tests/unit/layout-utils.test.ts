import {describe, expect, test} from '@jest/globals';
import {calculateMainViewPageSize, calculateDiffViewportRows} from '../../src/shared/utils/layout.js';

describe('layout utils', () => {
  test('calculates conservative main view page size', () => {
    expect(calculateMainViewPageSize(24, 80)).toBe(19);
    expect(calculateMainViewPageSize(24, 80, {hasMemoryWarning: true})).toBe(17);
    expect(calculateMainViewPageSize(24, 80, {hasUpdateBanner: true})).toBe(17);
    expect(calculateMainViewPageSize(24, 80, {hasMemoryWarning: true, hasUpdateBanner: true})).toBe(15);
  });

  test('calculates conservative diff viewport rows', () => {
    expect(calculateDiffViewportRows(24)).toBe(22);
    expect(calculateDiffViewportRows(24, {hasFileHeader: true, hasHunkHeader: true})).toBe(20);
    expect(calculateDiffViewportRows(24, {showCommentSummary: true})).toBe(21);
    expect(calculateDiffViewportRows(24, {overlayHeight: 8})).toBe(14);
  });

  test('never returns less than one row', () => {
    expect(calculateMainViewPageSize(1, 80)).toBe(1);
    expect(calculateDiffViewportRows(1, {hasFileHeader: true, hasHunkHeader: true, showCommentSummary: true, overlayHeight: 10})).toBe(1);
  });
});
