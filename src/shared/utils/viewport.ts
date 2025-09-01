import {LineWrapper} from './lineWrapper.js';

export interface ViewportInfo {
  firstVisibleLine: number;      // First logical line index visible
  visibleLines: number[];        // Array of logical line indices to render
  totalVisualRows: number;       // Total rows if all content displayed
  viewportStartRow: number;      // Which visual row the viewport starts at
  viewportHeight: number;        // Available height in rows
}

export interface LineRenderInfo {
  lineIndex: number;             // Logical line index
  visualRows: string[];          // Actual text rows to render
  isSelected: boolean;           // Is this the selected line
}

/**
 * Pure utility class for viewport calculations.
 * Provides a single source of truth for what should be visible on screen.
 */
export class ViewportCalculator {
  
  /**
   * Calculate viewport information for a list of text lines.
   * This is the core method that determines what should be visible.
   * 
   * @param lines Array of text content to display
   * @param selectedLineIndex Currently selected logical line (for cursor positioning)
   * @param scrollRow Which visual row should be at the top of viewport (0-based)
   * @param viewportHeight How many rows can fit in the viewport
   * @param maxWidth Maximum width for text (for wrapping calculations)
   * @param wrapMode Whether to wrap text or truncate it
   */
  static calculate(
    lines: string[],
    selectedLineIndex: number,
    scrollRow: number,
    viewportHeight: number,
    maxWidth: number,
    wrapMode: 'wrap' | 'truncate'
  ): ViewportInfo {
    
    if (wrapMode === 'truncate') {
      return this.calculateTruncateMode(lines, selectedLineIndex, scrollRow, viewportHeight);
    } else {
      return this.calculateWrapMode(lines, selectedLineIndex, scrollRow, viewportHeight, maxWidth);
    }
  }
  
  /**
   * Simple truncate mode: 1 line = 1 row, direct mapping
   */
  private static calculateTruncateMode(
    lines: string[],
    selectedLineIndex: number,
    scrollRow: number,
    viewportHeight: number
  ): ViewportInfo {
    
    const totalLines = lines.length;
    const firstVisibleLine = Math.max(0, Math.min(scrollRow, totalLines - 1));
    const lastVisibleLine = Math.min(totalLines - 1, firstVisibleLine + viewportHeight - 1);
    
    const visibleLines: number[] = [];
    for (let i = firstVisibleLine; i <= lastVisibleLine; i++) {
      visibleLines.push(i);
    }
    
    return {
      firstVisibleLine,
      visibleLines,
      totalVisualRows: totalLines,
      viewportStartRow: firstVisibleLine,
      viewportHeight
    };
  }
  
  /**
   * Wrap mode: calculate based on actual visual row consumption
   */
  private static calculateWrapMode(
    lines: string[],
    selectedLineIndex: number,
    scrollRow: number,
    viewportHeight: number,
    maxWidth: number
  ): ViewportInfo {
    
    // Build a map of line index -> visual row start position
    const lineToRowMap: number[] = [];
    let currentRow = 0;
    
    for (let i = 0; i < lines.length; i++) {
      lineToRowMap[i] = currentRow;
      const height = LineWrapper.calculateHeight(lines[i], maxWidth);
      currentRow += height;
    }
    
    const totalVisualRows = currentRow;
    
    // Find first visible line - the line that contains the scroll row
    let firstVisibleLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lineToRowMap[i] <= scrollRow) {
        firstVisibleLine = i;
      } else {
        break;
      }
    }
    
    // Collect visible lines until we fill the viewport
    const visibleLines: number[] = [];
    let accumulatedRows = 0;
    let currentLineIndex = firstVisibleLine;
    
    // Account for partial first line if scroll is mid-line
    if (firstVisibleLine < lines.length) {
      const firstLineStartRow = lineToRowMap[firstVisibleLine];
      const firstLineHeight = LineWrapper.calculateHeight(lines[firstVisibleLine], maxWidth);
      const partialFirstLineRows = Math.max(0, firstLineStartRow + firstLineHeight - scrollRow);
      accumulatedRows = partialFirstLineRows;
      visibleLines.push(firstVisibleLine);
      currentLineIndex = firstVisibleLine + 1;
    }
    
    // Add subsequent complete lines
    while (currentLineIndex < lines.length && accumulatedRows < viewportHeight) {
      const lineHeight = LineWrapper.calculateHeight(lines[currentLineIndex], maxWidth);
      
      if (accumulatedRows + lineHeight > viewportHeight) {
        // This line would overflow, but include it anyway for partial display
        visibleLines.push(currentLineIndex);
        break;
      }
      
      visibleLines.push(currentLineIndex);
      accumulatedRows += lineHeight;
      currentLineIndex++;
    }
    
    return {
      firstVisibleLine,
      visibleLines,
      totalVisualRows,
      viewportStartRow: scrollRow,
      viewportHeight
    };
  }

  /**
   * Calculate viewport using precomputed per-line heights and start rows.
   * This avoids recomputing wrapping and runs in O(visibleLines) time.
   *
   * @param lineHeights Height in visual rows for each logical line (>=1)
   * @param lineStartRows Prefix sums (start row index for each line)
   * @param scrollRow Which visual row should be at the top of viewport (0-based)
   * @param viewportHeight How many rows can fit in the viewport
   */
  static calculateFromHeights(
    lineHeights: number[],
    lineStartRows: number[],
    scrollRow: number,
    viewportHeight: number
  ): ViewportInfo {
    const totalLines = lineHeights.length;
    if (totalLines === 0) {
      return {
        firstVisibleLine: 0,
        visibleLines: [],
        totalVisualRows: 0,
        viewportStartRow: scrollRow,
        viewportHeight
      };
    }

    // total rows = start of last line + its height
    const totalVisualRows = lineStartRows[totalLines - 1] + lineHeights[totalLines - 1];

    // Binary search the first line whose start row <= scrollRow
    let lo = 0;
    let hi = totalLines - 1;
    let firstVisibleLine = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineStartRows[mid] <= scrollRow) {
        firstVisibleLine = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    // Collect lines until we fill viewport
    const visibleLines: number[] = [];
    let accumulatedRows = Math.max(0, (lineStartRows[firstVisibleLine] + lineHeights[firstVisibleLine]) - scrollRow);
    visibleLines.push(firstVisibleLine);

    let idx = firstVisibleLine + 1;
    while (idx < totalLines && accumulatedRows < viewportHeight) {
      const h = lineHeights[idx];
      visibleLines.push(idx);
      accumulatedRows += h;
      if (accumulatedRows >= viewportHeight) break;
      idx++;
    }

    return {
      firstVisibleLine,
      visibleLines,
      totalVisualRows,
      viewportStartRow: scrollRow,
      viewportHeight
    };
  }
  
  /**
   * Calculate scroll position to keep a specific line visible.
   * Returns the scroll row needed to ensure the line is in viewport.
   */
  static calculateScrollToShowLine(
    lines: string[],
    targetLineIndex: number,
    currentScrollRow: number,
    viewportHeight: number,
    maxWidth: number,
    wrapMode: 'wrap' | 'truncate'
  ): number {
    
    if (wrapMode === 'truncate') {
      // Simple case: line index = row index
      if (targetLineIndex < currentScrollRow) {
        return targetLineIndex;
      }
      if (targetLineIndex >= currentScrollRow + viewportHeight) {
        return Math.max(0, targetLineIndex - viewportHeight + 1);
      }
      return currentScrollRow; // Already visible
    }
    
    // Wrap mode: need to calculate row positions
    let targetRowStart = 0;
    for (let i = 0; i < Math.min(targetLineIndex, lines.length); i++) {
      targetRowStart += LineWrapper.calculateHeight(lines[i], maxWidth);
    }
    
    const targetRowEnd = targetRowStart + LineWrapper.calculateHeight(lines[targetLineIndex] || '', maxWidth) - 1;
    
    // Check if target line is already fully visible
    const viewportEndRow = currentScrollRow + viewportHeight - 1;
    if (targetRowStart >= currentScrollRow && targetRowEnd <= viewportEndRow) {
      return currentScrollRow; // Already visible
    }
    
    // Scroll to show the line
    if (targetRowStart < currentScrollRow) {
      return targetRowStart; // Scroll up
    } else {
      return Math.max(0, targetRowEnd - viewportHeight + 1); // Scroll down
    }
  }

  /**
   * Calculate scroll row to reveal a target line using precomputed heights.
   */
  static calculateScrollToShowLineFromHeights(
    lineHeights: number[],
    lineStartRows: number[],
    targetLineIndex: number,
    currentScrollRow: number,
    viewportHeight: number
  ): number {
    const totalLines = lineHeights.length;
    if (totalLines === 0) return 0;
    const targetRowStart = lineStartRows[targetLineIndex] || 0;
    const targetRowEnd = targetRowStart + (lineHeights[targetLineIndex] || 1) - 1;

    const viewportEndRow = currentScrollRow + viewportHeight - 1;
    if (targetRowStart >= currentScrollRow && targetRowEnd <= viewportEndRow) {
      return currentScrollRow;
    }
    if (targetRowStart < currentScrollRow) {
      return targetRowStart;
    }
    return Math.max(0, targetRowEnd - viewportHeight + 1);
  }
  
  /**
   * Get maximum scroll position (prevents scrolling past end of content)
   */
  static getMaxScrollRow(
    lines: string[],
    viewportHeight: number,
    maxWidth: number,
    wrapMode: 'wrap' | 'truncate'
  ): number {
    
    if (wrapMode === 'truncate') {
      return Math.max(0, lines.length - viewportHeight);
    }
    
    const totalRows = LineWrapper.calculateTotalHeight(lines, maxWidth);
    return Math.max(0, totalRows - viewportHeight);
  }

  /**
   * Maximum scroll row using precomputed heights.
   */
  static getMaxScrollRowFromHeights(
    lineHeights: number[],
    lineStartRows: number[],
    viewportHeight: number
  ): number {
    const totalLines = lineHeights.length;
    if (totalLines === 0) return 0;
    const totalRows = lineStartRows[totalLines - 1] + lineHeights[totalLines - 1];
    return Math.max(0, totalRows - viewportHeight);
  }
}
