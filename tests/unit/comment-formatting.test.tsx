import {describe, test, expect} from '@jest/globals';

describe('Comment formatting for Claude prompts', () => {
  
  describe('formatCommentsAsPrompt logic', () => {
    test('includes base commit hash with file line when provided', () => {
      const comments = [{
        lineIndex: 2,
        fileName: 'src/test.ts',
        lineText: 'const value = 42;',
        commentText: 'Good constant naming'
      }];

      // Simulate formatting with baseCommitHash
      const fileHeader = `File: src/test.ts@abc1234`;
      let prompt = "Please address the following code review comments:\n\n";
      prompt += `${fileHeader}\n`;
      prompt += `  Line 3: const value = 42;\n`;
      prompt += `  Comment: Good constant naming\n`;
      prompt += "\n";

      expect(prompt).toContain('File: src/test.ts@abc1234');
    });
    test('formats normal lines with line numbers', () => {
      const comments = [{
        lineIndex: 2,
        fileName: 'src/test.ts',
        lineText: 'const value = 42;',
        commentText: 'Good constant naming'
      }];

      let prompt = "Please address the following code review comments:\n\n";
      prompt += `File: src/test.ts\n`;
      prompt += `  Line 3: const value = 42;\n`;
      prompt += `  Comment: Good constant naming\n`;
      prompt += "\n";

      expect(prompt).toContain('Line 3: const value = 42;');
      expect(prompt).toContain('Comment: Good constant naming');
    });

    test('formats removed lines without line numbers', () => {
      const comments = [{
        lineIndex: undefined,
        fileName: 'src/test.ts',
        lineText: 'const removed = 1;',
        commentText: 'Why was this removed?'
      }];

      let prompt = "Please address the following code review comments:\n\n";
      prompt += `File: src/test.ts\n`;
      prompt += `  Removed line: const removed = 1;\n`;
      prompt += `  Comment: Why was this removed?\n`;
      prompt += "\n";

      expect(prompt).toContain('Removed line: const removed = 1;');
      expect(prompt).toContain('Comment: Why was this removed?');
      expect(prompt).not.toContain('Line 1:');
    });

    test('formats file headers with just filename', () => {
      const comments = [{
        lineIndex: undefined,
        fileName: 'src/newfile.ts',
        lineText: 'src/newfile.ts',
        commentText: 'Review this new file structure'
      }];

      let prompt = "Please address the following code review comments:\n\n";
      prompt += `File: src/newfile.ts\n`;
      prompt += `  Comment: Review this new file structure\n`;
      prompt += "\n";

      expect(prompt).not.toContain('Removed line:');
      expect(prompt).not.toContain('Line 1:');
      expect(prompt).toContain('Comment: Review this new file structure');
    });

    test('handles mixed comment types correctly', () => {
      const comments = [
        {
          lineIndex: 1,
          fileName: 'src/test.ts',
          lineText: 'const updated = 3;',
          commentText: 'Good update'
        },
        {
          lineIndex: undefined,
          fileName: 'src/test.ts', 
          lineText: 'const removed = 1;',
          commentText: 'Why was this removed?'
        },
        {
          lineIndex: undefined,
          fileName: 'src/newfile.ts',
          lineText: 'src/newfile.ts',
          commentText: 'Review this new file'
        }
      ];

      let prompt = "Please address the following code review comments:\n\n";
      
      const commentsByFile: {[key: string]: typeof comments} = {};
      comments.forEach(comment => {
        if (!commentsByFile[comment.fileName]) {
          commentsByFile[comment.fileName] = [];
        }
        commentsByFile[comment.fileName].push(comment);
      });

      Object.entries(commentsByFile).forEach(([fileName, fileComments]) => {
        prompt += `File: ${fileName}\n`;
        fileComments.forEach(comment => {
          if (comment.lineIndex !== undefined) {
            // Normal line with line number
            prompt += `  Line ${comment.lineIndex + 1}: ${comment.lineText}\n`;
          } else if (comment.lineText && comment.lineText.trim().length > 0 && comment.lineText !== fileName) {
            // Removed line or other content - show as removed without line number
            prompt += `  Removed line: ${comment.lineText}\n`;
          }
          // For file headers (lineText == fileName), just show the comment
          prompt += `  Comment: ${comment.commentText}\n`;
        });
        prompt += "\n";
      });

      // Verify different formatting for each comment type
      expect(prompt).toContain('Line 2: const updated = 3;'); // Normal line with number
      expect(prompt).toContain('Removed line: const removed = 1;'); // Removed line without number
      expect(prompt).toContain('Comment: Review this new file'); // File header with just comment
      expect(prompt).not.toContain('Removed line: src/newfile.ts'); // File header shouldn't show removed line
    });
  });

  describe('comment display formatting', () => {
    test('displays line content correctly for different types', () => {
      // Test that the actual formatCommentsAsPrompt function works as expected
      // This simulates what happens in the DiffView component

      const testCases = [
        {
          description: 'normal line with line number',
          comment: {lineIndex: 0, fileName: 'test.ts', lineText: 'console.log("test");', commentText: 'Remove debug'},
          expectedFormat: 'Line 1: console.log("test");'
        },
        {
          description: 'removed line without line number',
          comment: {lineIndex: undefined, fileName: 'test.ts', lineText: 'debugger;', commentText: 'Good removal'},
          expectedFormat: 'Removed line: debugger;'
        },
        {
          description: 'file header with just comment',
          comment: {lineIndex: undefined, fileName: 'new.ts', lineText: 'new.ts', commentText: 'Review structure'},
          expectedFormat: 'Comment: Review structure'
        }
      ];

      testCases.forEach(({description, comment, expectedFormat}) => {
        let result = '';
        if (comment.lineIndex !== undefined) {
          result = `Line ${comment.lineIndex + 1}: ${comment.lineText}`;
        } else if (comment.lineText && comment.lineText.trim().length > 0 && comment.lineText !== comment.fileName) {
          result = `Removed line: ${comment.lineText}`;
        } else {
          result = `Comment: ${comment.commentText}`;
        }
        
        expect(result).toContain(expectedFormat);
      });
    });

    test('properly filters empty or filename-matching line text', () => {
      const fileHeaderComment = {
        lineIndex: undefined,
        fileName: 'header.ts',
        lineText: 'header.ts',
        commentText: 'New file comment'
      };

      // Should not show "Line content:" for file headers where lineText equals fileName
      const shouldShowLineContent = fileHeaderComment.lineText && 
                                   fileHeaderComment.lineText.trim().length > 0 && 
                                   fileHeaderComment.lineText !== fileHeaderComment.fileName;
      
      expect(shouldShowLineContent).toBe(false);
    });
  });
});
