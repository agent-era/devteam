import type {DiffLine, SideBySideLine} from './types.js';

export function convertToSideBySide(unifiedLines: DiffLine[]): SideBySideLine[] {
  const sideBySideLines: SideBySideLine[] = [];
  let lineIndex = 0;
  let i = 0;

  while (i < unifiedLines.length) {
    const line = unifiedLines[i];

    if (line.type === 'header') {
      sideBySideLines.push({
        left: {type: 'header', text: line.text, fileName: line.fileName, headerType: line.headerType},
        right: {type: 'header', text: line.text, fileName: line.fileName, headerType: line.headerType},
        lineIndex: lineIndex++
      });
      i++;
    } else if (line.type === 'context') {
      sideBySideLines.push({
        left: {type: 'context', text: line.text, fileName: line.fileName, oldLineIndex: line.oldLineIndex, newLineIndex: line.newLineIndex},
        right: {type: 'context', text: line.text, fileName: line.fileName, oldLineIndex: line.oldLineIndex, newLineIndex: line.newLineIndex},
        lineIndex: lineIndex++
      });
      i++;
    } else if (line.type === 'removed') {
      const removedLines: DiffLine[] = [];
      while (i < unifiedLines.length && unifiedLines[i].type === 'removed') {
        removedLines.push(unifiedLines[i]);
        i++;
      }

      const addedLines: DiffLine[] = [];
      while (i < unifiedLines.length && unifiedLines[i].type === 'added') {
        addedLines.push(unifiedLines[i]);
        i++;
      }

      const maxLines = Math.max(removedLines.length, addedLines.length);
      for (let j = 0; j < maxLines; j++) {
        const removedLine = removedLines[j] || null;
        const addedLine = addedLines[j] || null;
        sideBySideLines.push({
          left: removedLine
            ? {type: 'removed', text: removedLine.text, fileName: removedLine.fileName, oldLineIndex: removedLine.oldLineIndex}
            : {type: 'empty', text: '', fileName: line.fileName},
          right: addedLine
            ? {type: 'added', text: addedLine.text, fileName: addedLine.fileName, newLineIndex: addedLine.newLineIndex}
            : {type: 'empty', text: '', fileName: line.fileName},
          lineIndex: lineIndex++
        });
      }
    } else if (line.type === 'added') {
      sideBySideLines.push({
        left: {type: 'empty', text: '', fileName: line.fileName},
        right: {type: 'added', text: line.text, fileName: line.fileName, newLineIndex: line.newLineIndex},
        lineIndex: lineIndex++
      });
      i++;
    } else {
      i++;
    }
  }

  return sideBySideLines;
}
