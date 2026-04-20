import {describe, test, expect} from '@jest/globals';
import {formatCommentsAsPrompt, formatCommentsAsLines} from '../../src/shared/utils/diff/formatCommentsAsPrompt.js';

describe('formatCommentsAsPrompt', () => {
  test('includes the intro line and trailing blank between files', () => {
    const prompt = formatCommentsAsPrompt([
      {lineIndex: 0, fileName: 'a.ts', lineText: 'hi', commentText: 'first'},
      {lineIndex: 1, fileName: 'b.ts', lineText: 'bye', commentText: 'second'},
    ]);
    expect(prompt.startsWith('Please address the following code review comments:\n\n')).toBe(true);
    expect(prompt).toContain('File: a.ts\n  Line 1: hi\n  Comment: first\n');
    expect(prompt).toContain('File: b.ts\n  Line 2: bye\n  Comment: second\n');
  });

  test('adds workspace context line when workspaceFeature + project provided', () => {
    const prompt = formatCommentsAsPrompt(
      [{lineIndex: 0, fileName: 'a.ts', lineText: 'x', commentText: 'c'}],
      {workspaceFeature: 'big-feat', project: 'api'},
    );
    expect(prompt).toContain(`Context: In workspace 'big-feat', target child directory: ./api`);
  });

  test('appends @hash to the file header when baseCommitHash provided', () => {
    const prompt = formatCommentsAsPrompt(
      [{lineIndex: 0, fileName: 'a.ts', lineText: 'x', commentText: 'c'}],
      {baseCommitHash: 'abc123'},
    );
    expect(prompt).toContain('File: a.ts@abc123');
  });

  test('formats removed lines with original line numbers', () => {
    const prompt = formatCommentsAsPrompt([{
      lineIndex: undefined, fileName: 'a.ts', lineText: 'removed',
      commentText: 'why gone?', isRemoved: true, originalLineIndex: 42,
    }]);
    expect(prompt).toContain('  Removed line 42: removed\n');
    expect(prompt).toContain('  Comment: why gone?\n');
  });

  test('formats removed lines without original line number', () => {
    const prompt = formatCommentsAsPrompt([{
      lineIndex: undefined, fileName: 'a.ts', lineText: 'gone',
      commentText: 'oops', isRemoved: true,
    }]);
    expect(prompt).toContain('  Removed line: gone\n');
  });

  test('treats file-level comments as header-only: no line/removed-line entry', () => {
    const prompt = formatCommentsAsPrompt([{
      lineIndex: undefined, fileName: 'new.ts', lineText: 'new.ts',
      commentText: 'review this new file', isFileLevel: true,
    }]);
    expect(prompt).toContain('File: new.ts');
    expect(prompt).toContain('  Comment: review this new file');
    expect(prompt).not.toContain('Line 1:');
    expect(prompt).not.toContain('Removed line');
  });

  test('groups multiple comments by file', () => {
    const prompt = formatCommentsAsPrompt([
      {lineIndex: 0, fileName: 'a.ts', lineText: 'x', commentText: 'c1'},
      {lineIndex: 1, fileName: 'a.ts', lineText: 'y', commentText: 'c2'},
      {lineIndex: 0, fileName: 'b.ts', lineText: 'z', commentText: 'c3'},
    ]);
    // Two lines under a.ts before b.ts header
    const aHeaderPos = prompt.indexOf('File: a.ts');
    const bHeaderPos = prompt.indexOf('File: b.ts');
    expect(aHeaderPos).toBeGreaterThanOrEqual(0);
    expect(bHeaderPos).toBeGreaterThan(aHeaderPos);
    const between = prompt.slice(aHeaderPos, bHeaderPos);
    expect(between).toContain('Line 1: x');
    expect(between).toContain('Line 2: y');
  });

  test('formatCommentsAsLines matches formatCommentsAsPrompt line-for-line', () => {
    const comments = [
      {lineIndex: 0, fileName: 'a.ts', lineText: 'x', commentText: 'c1'},
      {lineIndex: undefined, fileName: 'a.ts', lineText: 'r', commentText: 'rm', isRemoved: true, originalLineIndex: 3},
    ];
    const prompt = formatCommentsAsPrompt(comments);
    const joined = formatCommentsAsLines(comments).join('\n') + '\n';
    expect(joined).toBe(prompt);
  });
});
