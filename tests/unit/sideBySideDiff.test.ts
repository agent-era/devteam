import {describe, test, expect} from '@jest/globals';

// We need to access the internal function from DiffView
// For this test, we'll create a simplified version of the algorithm
type DiffLine = {type: 'added'|'removed'|'context'|'header'; text: string; fileName?: string};
type SideBySideLine = {
  left: {type: 'removed'|'context'|'header'|'empty'; text: string; fileName?: string} | null;
  right: {type: 'added'|'context'|'header'|'empty'; text: string; fileName?: string} | null;
  lineIndex: number;
};

function convertToSideBySide(unifiedLines: DiffLine[]): SideBySideLine[] {
  const sideBySideLines: SideBySideLine[] = [];
  let lineIndex = 0;
  let i = 0;

  while (i < unifiedLines.length) {
    const line = unifiedLines[i];
    
    if (line.type === 'header') {
      // Headers appear on both sides
      sideBySideLines.push({
        left: {type: 'header', text: line.text, fileName: line.fileName},
        right: {type: 'header', text: line.text, fileName: line.fileName},
        lineIndex: lineIndex++
      });
      i++;
    } else if (line.type === 'context') {
      // Context lines appear on both sides
      sideBySideLines.push({
        left: {type: 'context', text: line.text, fileName: line.fileName},
        right: {type: 'context', text: line.text, fileName: line.fileName},
        lineIndex: lineIndex++
      });
      i++;
    } else if (line.type === 'removed') {
      // Collect all consecutive removed lines
      const removedLines: DiffLine[] = [];
      while (i < unifiedLines.length && unifiedLines[i].type === 'removed') {
        removedLines.push(unifiedLines[i]);
        i++;
      }
      
      // Collect all consecutive added lines that follow
      const addedLines: DiffLine[] = [];
      while (i < unifiedLines.length && unifiedLines[i].type === 'added') {
        addedLines.push(unifiedLines[i]);
        i++;
      }
      
      // Pair them up, filling with empty lines as needed
      const maxLines = Math.max(removedLines.length, addedLines.length);
      
      for (let j = 0; j < maxLines; j++) {
        const removedLine = removedLines[j] || null;
        const addedLine = addedLines[j] || null;
        
        sideBySideLines.push({
          left: removedLine ? {type: 'removed', text: removedLine.text, fileName: removedLine.fileName} : {type: 'empty', text: '', fileName: line.fileName},
          right: addedLine ? {type: 'added', text: addedLine.text, fileName: addedLine.fileName} : {type: 'empty', text: '', fileName: line.fileName},
          lineIndex: lineIndex++
        });
      }
    } else if (line.type === 'added') {
      // Added lines without preceding removed lines
      sideBySideLines.push({
        left: {type: 'empty', text: '', fileName: line.fileName},
        right: {type: 'added', text: line.text, fileName: line.fileName},
        lineIndex: lineIndex++
      });
      i++;
    } else {
      i++;
    }
  }

  return sideBySideLines;
}

describe('Side-by-side diff conversion', () => {
  test('should convert simple addition correctly', () => {
    const unified: DiffLine[] = [
      {type: 'header', text: '📁 test.js', fileName: 'test.js'},
      {type: 'context', text: 'function test() {', fileName: 'test.js'},
      {type: 'added', text: '  console.log("new line");', fileName: 'test.js'},
      {type: 'context', text: '}', fileName: 'test.js'}
    ];

    const result = convertToSideBySide(unified);

    expect(result).toHaveLength(4);
    
    // Header should appear on both sides
    expect(result[0].left?.type).toBe('header');
    expect(result[0].right?.type).toBe('header');
    expect(result[0].left?.text).toBe('📁 test.js');
    
    // Context should appear on both sides
    expect(result[1].left?.type).toBe('context');
    expect(result[1].right?.type).toBe('context');
    
    // Added line should be empty on left, added on right
    expect(result[2].left?.type).toBe('empty');
    expect(result[2].right?.type).toBe('added');
    expect(result[2].right?.text).toBe('  console.log("new line");');
  });

  test('should convert simple removal correctly', () => {
    const unified: DiffLine[] = [
      {type: 'header', text: '📁 test.js', fileName: 'test.js'},
      {type: 'context', text: 'function test() {', fileName: 'test.js'},
      {type: 'removed', text: '  console.log("old line");', fileName: 'test.js'},
      {type: 'context', text: '}', fileName: 'test.js'}
    ];

    const result = convertToSideBySide(unified);

    expect(result).toHaveLength(4);
    
    // Removed line should be removed on left, empty on right
    expect(result[2].left?.type).toBe('removed');
    expect(result[2].right?.type).toBe('empty');
    expect(result[2].left?.text).toBe('  console.log("old line");');
  });

  test('should pair removed and added lines correctly', () => {
    const unified: DiffLine[] = [
      {type: 'header', text: '📁 test.js', fileName: 'test.js'},
      {type: 'removed', text: '  const old = "old";', fileName: 'test.js'},
      {type: 'removed', text: '  console.log(old);', fileName: 'test.js'},
      {type: 'added', text: '  const newVar = "new";', fileName: 'test.js'},
      {type: 'added', text: '  console.log(newVar);', fileName: 'test.js'},
      {type: 'context', text: '}', fileName: 'test.js'}
    ];

    const result = convertToSideBySide(unified);

    expect(result).toHaveLength(4);
    
    // First pair: removed + added
    expect(result[1].left?.type).toBe('removed');
    expect(result[1].right?.type).toBe('added');
    expect(result[1].left?.text).toBe('  const old = "old";');
    expect(result[1].right?.text).toBe('  const newVar = "new";');
    
    // Second pair: removed + added
    expect(result[2].left?.type).toBe('removed');
    expect(result[2].right?.type).toBe('added');
    expect(result[2].left?.text).toBe('  console.log(old);');
    expect(result[2].right?.text).toBe('  console.log(newVar);');
  });

  test('should handle uneven removed/added counts', () => {
    const unified: DiffLine[] = [
      {type: 'removed', text: 'line1', fileName: 'test.js'},
      {type: 'removed', text: 'line2', fileName: 'test.js'},
      {type: 'removed', text: 'line3', fileName: 'test.js'},
      {type: 'added', text: 'new line', fileName: 'test.js'}
    ];

    const result = convertToSideBySide(unified);

    expect(result).toHaveLength(3);
    
    // First pair: removed + added
    expect(result[0].left?.type).toBe('removed');
    expect(result[0].right?.type).toBe('added');
    
    // Second pair: removed + empty
    expect(result[1].left?.type).toBe('removed');
    expect(result[1].right?.type).toBe('empty');
    
    // Third pair: removed + empty
    expect(result[2].left?.type).toBe('removed');
    expect(result[2].right?.type).toBe('empty');
  });
});