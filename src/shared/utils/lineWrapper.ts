import {stringDisplayWidth} from './formatting.js';

/**
 * Pure utility class for handling text line wrapping with Unicode support.
 * Provides a simple, predictable API for calculating how text will wrap in terminal display.
 */
export class LineWrapper {
  /**
   * Split a line of text into wrapped segments that fit within maxWidth.
   * Handles Unicode characters properly using display width, not string length.
   */
  static wrapLine(text: string, maxWidth: number): string[] {
    if (maxWidth <= 0) return [text];
    if (text === '') return [''];
    
    const segments: string[] = [];
    let currentSegment = '';
    let currentWidth = 0;
    
    for (const char of text) {
      const charWidth = stringDisplayWidth(char);
      
      if (currentWidth + charWidth > maxWidth && currentSegment.length > 0) {
        // Start new segment
        segments.push(currentSegment);
        currentSegment = char;
        currentWidth = charWidth;
      } else {
        // Add to current segment
        currentSegment += char;
        currentWidth += charWidth;
      }
    }
    
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }
    
    return segments.length > 0 ? segments : [''];
  }
  
  /**
   * Calculate how many terminal rows a line will occupy when wrapped.
   * Returns minimum of 1 (empty lines still take 1 row).
   */
  static calculateHeight(text: string, maxWidth: number): number {
    if (maxWidth <= 0) return 1;
    
    const displayWidth = stringDisplayWidth(text);
    if (displayWidth === 0) return 1; // Empty lines still take 1 row
    
    return Math.ceil(displayWidth / maxWidth);
  }
  
  /**
   * Calculate total height for multiple lines.
   * Convenience method for calculating height of an array of text lines.
   */
  static calculateTotalHeight(lines: string[], maxWidth: number): number {
    return lines.reduce((total, line) => total + this.calculateHeight(line, maxWidth), 0);
  }
}