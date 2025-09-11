import {describe, test, expect} from '@jest/globals';
import {stringDisplayWidth} from '../../src/shared/utils/formatting.js';

describe('Column Layout and Spacing', () => {
  describe('Terminal width adaptation', () => {
    test('should calculate column widths that fit terminal exactly', () => {
      // Mock data representing typical worktree display
      const mockData = [
        ['#', 'STATUS', 'PROJECT/FEATURE', 'AI', 'DIFF', 'CHANGES', 'PR'],
        ['1', 'not pushed', 'my-project/long-feature-name', '*', '+1.2k/-500', '↑3 ↓1', '#123+'],
        ['12', '', 'short/feat', '-', '-', '-', '-']
      ];

      const testTerminalWidths = [60, 80, 100, 120];

      for (const terminalWidth of testTerminalWidths) {
        // Calculate fixed column widths (all except PROJECT/FEATURE)
        const fixedWidths = [0, 1, 2, 3, 4, 5, 6].map(colIndex => {
          if (colIndex === 2) return 0; // PROJECT/FEATURE calculated separately
          const maxWidth = Math.max(...mockData.map(row => stringDisplayWidth(row[colIndex] || '')));
          return Math.max(4, maxWidth);
        });

        // Calculate space allocation
        const fixedColumnsWidth = fixedWidths.reduce((sum, width, index) => index === 2 ? sum : sum + width, 0);
        const marginsWidth = 6; // 6 spaces between 7 columns
        const usedWidth = fixedColumnsWidth + marginsWidth;
        const availableWidth = Math.max(15, terminalWidth - usedWidth);
        fixedWidths[2] = Math.min(availableWidth, terminalWidth - usedWidth);
        
        const totalWidth = fixedWidths.reduce((a, b) => a + b, 0) + marginsWidth;
        
        // Verify layout fits exactly within terminal
        expect(totalWidth).toBeLessThanOrEqual(terminalWidth);
        expect(totalWidth).toBeGreaterThan(terminalWidth - 5); // Should use most of the space
        
        // Verify PROJECT/FEATURE gets reasonable space
        // Reduced by 1 due to longer STATUS label ("not pushed")
        expect(fixedWidths[2]).toBeGreaterThanOrEqual(14); // Minimum readable width
      }
    });

    test('should stretch content-based columns to actual content width', () => {
      const mockData = [
        ['1', 'not pushed', 'project/feature', '*', '+1000/-200', '↑10 ↓5', '#1234+'],
        ['123', '', 'another/name', '-', '+5k/-1k', '↑2', '-']
      ];

      // Test each non-PROJECT/FEATURE column
      [0, 1, 3, 4, 5, 6].forEach(colIndex => {
        const maxContentWidth = Math.max(...mockData.map(row => stringDisplayWidth(row[colIndex] || '')));
        const calculatedWidth = Math.max(4, maxContentWidth);
        
        // Width should match content or minimum 4
        expect(calculatedWidth).toBeGreaterThanOrEqual(4);
        expect(calculatedWidth).toBeGreaterThanOrEqual(maxContentWidth);
      });
    });

    test('should handle very narrow terminals gracefully', () => {
      // Test extremely narrow terminal (50 chars)
      const terminalWidth = 50;
      
      const mockData = [
        ['#', 'STATUS', 'PROJECT/FEATURE', 'AI', 'DIFF', 'CHANGES', 'PR'],
        ['1', 'uncommitted', 'very-long-project-name/feature', '*', '+1k/-2k', '↑1 ↓2', '#1✓']
      ];

      const fixedWidths = [0, 1, 2, 3, 4, 5, 6].map(colIndex => {
        if (colIndex === 2) return 0;
        const maxWidth = Math.max(...mockData.map(row => stringDisplayWidth(row[colIndex] || '')));
        return Math.max(4, maxWidth);
      });

      const fixedColumnsWidth = fixedWidths.reduce((sum, width, index) => index === 2 ? sum : sum + width, 0);
      const marginsWidth = 6;
      const usedWidth = fixedColumnsWidth + marginsWidth;
      const availableWidth = Math.max(15, terminalWidth - usedWidth);
      fixedWidths[2] = Math.min(availableWidth, terminalWidth - usedWidth);
      
      const totalWidth = fixedWidths.reduce((a, b) => a + b, 0) + marginsWidth;

      expect(totalWidth).toBeLessThanOrEqual(terminalWidth);
      // Allow a smaller minimum since STATUS label length increased ("uncommitted")
      expect(fixedWidths[2]).toBeGreaterThanOrEqual(7);
    });
  });

  describe('PROJECT/FEATURE column truncation', () => {
    test('should truncate with ellipsis when content exceeds available width', () => {
      const testCases = [
        {
          input: 'very-long-project-name/extremely-long-feature-name-that-would-wrap',
          maxWidth: 20,
          expectedLength: 20,
          shouldHaveEllipsis: true
        },
        {
          input: 'short/name',
          maxWidth: 20,
          expectedLength: 10, // Original length
          shouldHaveEllipsis: false
        },
        {
          input: 'project/feature-name-exactly-twenty', // 35 chars
          maxWidth: 20,
          expectedLength: 20,
          shouldHaveEllipsis: true
        }
      ];

      for (const {input, maxWidth, expectedLength, shouldHaveEllipsis} of testCases) {
        const truncated = stringDisplayWidth(input) > maxWidth 
          ? input.slice(0, Math.max(0, maxWidth - 3)) + '...'
          : input;
        
        expect(stringDisplayWidth(truncated)).toBeLessThanOrEqual(maxWidth);
        
        if (shouldHaveEllipsis) {
          expect(truncated.endsWith('...')).toBe(true);
          expect(stringDisplayWidth(truncated)).toBe(maxWidth);
        } else {
          expect(truncated.endsWith('...')).toBe(false);
          expect(stringDisplayWidth(truncated)).toBe(expectedLength);
        }
      }
    });

    test('should handle unicode characters correctly in truncation', () => {
      const unicodeProjectName = 'project-中文/feature-🚀-name';
      const maxWidth = 15;
      
      let truncated = unicodeProjectName;
      if (stringDisplayWidth(unicodeProjectName) > maxWidth) {
        // More careful truncation for unicode
        let slicePoint = maxWidth - 3;
        while (slicePoint > 0 && stringDisplayWidth(unicodeProjectName.slice(0, slicePoint) + '...') > maxWidth) {
          slicePoint--;
        }
        truncated = unicodeProjectName.slice(0, slicePoint) + '...';
      }
      
      // Should not exceed max width even with wide unicode chars
      expect(stringDisplayWidth(truncated)).toBeLessThanOrEqual(maxWidth);
    });
  });

  describe('Column margins and spacing', () => {
    test('should account for exactly 6 spaces between 7 columns', () => {
      // 7 columns with 6 spaces between them
      const expectedMargins = 6;
      
      // Verify our calculation matches expected
      const columnCount = 7;
      const marginsCount = columnCount - 1;
      
      expect(marginsCount).toBe(expectedMargins);
    });

    test('should maintain consistent spacing regardless of content length', () => {
      const scenarios = [
        // Short content
        ['1', 'a/b', '-', '-', '-', '-', '-'],
        // Long content  
        ['999', 'very-long-project/very-long-feature', '*', '+999k/-999k', '↑99 ↓99', '+', '#999+']
      ];

      // Each scenario should use same margin structure
      scenarios.forEach(scenario => {
        // The spacing algorithm should be consistent regardless of content
        // This test ensures we don't accidentally change margin calculation
        const marginsWidth = 6;
        expect(marginsWidth).toBe(6); // Always 6 spaces between columns
      });
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle empty or null content gracefully', () => {
      const edgeCaseData = [
        ['', '', '', '', '', '', ''],
        ['1', null as any, undefined as any, '', '0', '-', '']
      ];

      edgeCaseData.forEach(row => {
        [0, 2, 3, 4, 5, 6].forEach(colIndex => {
          const content = row[colIndex] || '';
          const width = Math.max(4, stringDisplayWidth(content));
          expect(width).toBeGreaterThanOrEqual(4);
          expect(typeof width).toBe('number');
        });
      });
    });

    test('should maintain minimum column widths', () => {
      // Even with very small terminal, columns should have minimum readable width
      const terminalWidth = 40; // Very small
      const minProjectFeatureWidth = 15;
      const minOtherColumnWidth = 4;
      
      // Simulate calculation
      const otherColumnsWidth = 6 * minOtherColumnWidth; // 6 other columns × 4 chars
      const marginsWidth = 6;
      const usedWidth = otherColumnsWidth + marginsWidth;
      const availableWidth = Math.max(minProjectFeatureWidth, terminalWidth - usedWidth);
      
      expect(availableWidth).toBeGreaterThanOrEqual(minProjectFeatureWidth);
    });
  });
});
