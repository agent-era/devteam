
import {
  kebabCase,
  truncateText,
  formatDiffStats,
  formatChangesStats,
  formatTimeAgo,
  stringDisplayWidth,
  truncateDisplay,
  padEndDisplay,
  padStartDisplay,
  fitDisplay,
} from '../../src/shared/utils/formatting.js';

jest.mock('../../src/constants.js', () => ({
  ...jest.requireActual('../../src/constants.js'),
  AMBIGUOUS_EMOJI_ARE_WIDE: true,
}));

describe('formatting utils', () => {
  describe('kebabCase', () => {
    it('should convert simple strings', () => {
      expect(kebabCase('hello world')).toBe('hello-world');
    });

    it('should handle multiple spaces', () => {
      expect(kebabCase('hello   world')).toBe('hello-world');
    });

    it('should handle leading/trailing spaces', () => {
      expect(kebabCase('  hello world  ')).toBe('hello-world');
    });

    it('should handle special characters', () => {
      expect(kebabCase('hello!@#$%^&*()_+-=[]{}|;:,.<>?/world')).toBe('hello-world');
    });
  });

  describe('truncateText', () => {
    it('should not truncate if text is shorter than maxLength', () => {
      expect(truncateText('hello', 10)).toBe('hello');
    });

    it('should truncate if text is longer than maxLength', () => {
      expect(truncateText('hello world', 8)).toBe('hello...');
    });

    it('should use a custom suffix', () => {
      expect(truncateText('hello world', 8, '--')).toBe('hello --');
    });
  });

  describe('formatDiffStats', () => {
    it('should format additions and deletions', () => {
      expect(formatDiffStats(10, 5)).toBe('+10/-5');
    });

    it('should handle large numbers', () => {
      expect(formatDiffStats(1234, 5678)).toBe('+1k/-5k');
    });

    it('should return '-' for no changes', () => {
      expect(formatDiffStats(0, 0)).toBe('-');
    });
  });

  describe('formatChangesStats', () => {
    it('should format ahead and behind counts', () => {
      expect(formatChangesStats(3, 5)).toBe('↑3 ↓5');
    });

    it('should handle only ahead', () => {
      expect(formatChangesStats(3, 0)).toBe('↑3');
    });

    it('should handle only behind', () => {
      expect(formatChangesStats(0, 5)).toBe('↓5');
    });
  });

  describe('formatTimeAgo', () => {
    const now = Math.floor(Date.now() / 1000);

    it('should format seconds', () => {
      expect(formatTimeAgo(now - 30)).toBe('30s');
    });

    it('should format minutes', () => {
      expect(formatTimeAgo(now - 90)).toBe('1m');
    });

    it('should format hours', () => {
      expect(formatTimeAgo(now - 3600)).toBe('1h');
    });

    it('should format days', () => {
      expect(formatTimeAgo(now - 86400)).toBe('1d');
    });

    it('should format months', () => {
      expect(formatTimeAgo(now - 2592000)).toBe('1mo');
    });

    it('should format years', () => {
      expect(formatTimeAgo(now - 31536000)).toBe('1y');
    });
  });

  describe('display width functions', () => {
    it('stringDisplayWidth', () => {
      expect(stringDisplayWidth('abc')).toBe(3);
      expect(stringDisplayWidth('✅')).toBe(1);
    });

    it('truncateDisplay', () => {
      expect(truncateDisplay('hello world', 8)).toBe('hello wo');
      expect(truncateDisplay('✅✅✅', 4)).toBe('✅✅✅');
    });

    it('padEndDisplay', () => {
      expect(padEndDisplay('abc', 5)).toBe('abc  ');
      expect(padEndDisplay('✅', 4)).toBe('✅   ');
    });

    it('padStartDisplay', () => {
      expect(padStartDisplay('abc', 5)).toBe('  abc');
      expect(padStartDisplay('✅', 4)).toBe('   ✅');
    });

    it('fitDisplay', () => {
      expect(fitDisplay('hello world', 8)).toBe('hello wo');
      expect(fitDisplay('abc', 5)).toBe('abc  ');
    });
  });
});
