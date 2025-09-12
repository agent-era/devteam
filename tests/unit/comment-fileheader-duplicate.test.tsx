import {describe, test, expect} from '@jest/globals';
import {formatCommentsAsPrompt} from '../../src/components/views/DiffView.js';

describe('File-level comment formatting', () => {
  test('does not include redundant filename line content for file header comments', () => {
    const fileName = 'src/newfile.ts';
    const comments = [
      {
        lineIndex: undefined,
        fileName,
        lineText: fileName, // file header stores filename as lineText
        commentText: 'Review this new file',
        isFileLevel: true
      }
    ];

    const prompt = formatCommentsAsPrompt(comments as any);

    // The prompt should contain the file header and the comment
    expect(prompt).toContain(`File: ${fileName}`);
    expect(prompt).toContain('Comment: Review this new file');

    // It should NOT redundantly include the filename as a removed line entry
    expect(prompt).not.toContain(`Removed line: ${fileName}`);
  });

  test('includes removed line with number when not file-level even if content equals filename', () => {
    const fileName = 'src/weird.ts';
    const comments = [
      {
        lineIndex: undefined,
        fileName,
        lineText: fileName, // looks like filename but is not a file header
        commentText: 'This is actually a removed line that equals filename',
        isFileLevel: false,
        isRemoved: true,
        originalLineIndex: 5
      }
    ];

    const prompt = formatCommentsAsPrompt(comments as any);
    expect(prompt).toContain(`File: ${fileName}`);
    expect(prompt).toContain(`Removed line 5: ${fileName}`);
    expect(prompt).toContain('Comment: This is actually a removed line that equals filename');
  });
});
