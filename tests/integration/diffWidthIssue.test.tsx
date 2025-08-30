import React from 'react';
import {describe, beforeEach, test, expect, jest} from '@jest/globals';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';
import {stringDisplayWidth, truncateDisplay, padEndDisplay} from '../../src/shared/utils/formatting.js';

const h = React.createElement;

describe('DiffView Width Calculation Issue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should reproduce width calculation off-by-one error', () => {
    // This test reproduces the specific width calculation issue
    // by simulating what the DiffView component does
    
    const terminalWidth = 80;
    const paneWidth = Math.floor((terminalWidth - 1) / 2); // Should be 39
    
    console.log(`Terminal width: ${terminalWidth}`);
    console.log(`Pane width: ${paneWidth}`);
    
    // Simulate the old approach (origin/main)
    const testText = 'const longFunctionName = () => { return "test"; };';
    const oldApproachText = truncateDisplay(testText, paneWidth - 2); // 37 chars
    const oldApproachOutput = padEndDisplay(' ' + oldApproachText, paneWidth);
    
    console.log(`Old approach (origin/main):`);
    console.log(`  Truncated text: "${oldApproachText}" (${oldApproachText.length} chars, ${stringDisplayWidth(oldApproachText)} display width)`);
    console.log(`  Final output: "${oldApproachOutput}" (${oldApproachOutput.length} chars, ${stringDisplayWidth(oldApproachOutput)} display width)`);
    console.log(`  Expected width: ${paneWidth}`);
    
    // Simulate the new approach (our branch with syntax highlighting)
    const actualRightText = testText;
    const truncatedText = truncateDisplay(actualRightText, paneWidth - 1); // 38 chars
    
    // This is what we do in the current implementation
    const leadingSpace = ' '; // 1 char
    const syntaxHighlightedText = truncatedText; // Assume syntax highlighting doesn't change length
    const paddingChars = Math.max(0, paneWidth - stringDisplayWidth(truncatedText) - 1);
    const padding = ' '.repeat(paddingChars);
    
    const newApproachOutput = leadingSpace + syntaxHighlightedText + padding;
    
    console.log(`\\nNew approach (our branch):`);
    console.log(`  Truncated text: "${truncatedText}" (${truncatedText.length} chars, ${stringDisplayWidth(truncatedText)} display width)`);
    console.log(`  Leading space: 1 char`);
    console.log(`  Padding: ${paddingChars} chars`);
    console.log(`  Final output: "${newApproachOutput}" (${newApproachOutput.length} chars, ${stringDisplayWidth(newApproachOutput)} display width)`);
    console.log(`  Expected width: ${paneWidth}`);
    
    // The issue: check if our approach gives the right width
    const oldWidth = stringDisplayWidth(oldApproachOutput);
    const newWidth = stringDisplayWidth(newApproachOutput);
    
    console.log(`\\nComparison:`);
    console.log(`  Old width: ${oldWidth} (${oldWidth === paneWidth ? 'CORRECT' : 'WRONG'})`);
    console.log(`  New width: ${newWidth} (${newWidth === paneWidth ? 'CORRECT' : 'WRONG'})`);
    
    if (oldWidth !== newWidth) {
      console.log(`  WIDTH MISMATCH! Difference: ${newWidth - oldWidth} characters`);
    }
    
    // Test with wide characters to see if that makes it worse
    const wideText = 'const 中文函数名 = () => { return "test"; };';
    const wideOldText = truncateDisplay(wideText, paneWidth - 2);
    const wideOldOutput = padEndDisplay(' ' + wideOldText, paneWidth);
    
    const wideTruncated = truncateDisplay(wideText, paneWidth - 1);
    const widePaddingChars = Math.max(0, paneWidth - stringDisplayWidth(wideTruncated) - 1);
    const wideNewOutput = ' ' + wideTruncated + ' '.repeat(widePaddingChars);
    
    console.log(`\\nWide character test:`);
    console.log(`  Wide text: "${wideText}"`);
    console.log(`  Old approach width: ${stringDisplayWidth(wideOldOutput)} (${stringDisplayWidth(wideOldOutput) === paneWidth ? 'CORRECT' : 'WRONG'})`);
    console.log(`  New approach width: ${stringDisplayWidth(wideNewOutput)} (${stringDisplayWidth(wideNewOutput) === paneWidth ? 'CORRECT' : 'WRONG'})`);
    
    // The test should verify that both approaches give the same width
    expect(stringDisplayWidth(oldApproachOutput)).toBe(paneWidth);
    expect(stringDisplayWidth(newApproachOutput)).toBe(paneWidth);
    expect(stringDisplayWidth(wideOldOutput)).toBe(paneWidth);
    expect(stringDisplayWidth(wideNewOutput)).toBe(paneWidth);
  });

  test('should show the actual inconsistency in truncation approaches', () => {
    const terminalWidth = 80;
    const paneWidth = Math.floor((terminalWidth - 1) / 2); // 39
    
    // The inconsistency in our current code:
    const rightFullText = 'const veryLongFunctionNameForTesting = () => { return "this is long"; };';
    
    // Line 1130 in DiffView.ts: 
    const rightText = truncateDisplay(rightFullText, paneWidth - 2); // 37 chars for non-syntax
    
    // Line 1213 in DiffView.ts for syntax highlighting:
    const truncatedText = truncateDisplay(rightFullText, paneWidth - 1); // 38 chars for syntax
    
    console.log(`\\nInconsistency in current code:`);
    console.log(`  Original text: "${rightFullText}"`);
    console.log(`  Non-syntax truncation (paneWidth - 2): "${rightText}" (${stringDisplayWidth(rightText)} display chars)`);
    console.log(`  Syntax truncation (paneWidth - 1): "${truncatedText}" (${stringDisplayWidth(truncatedText)} display chars)`);
    console.log(`  Difference: ${stringDisplayWidth(truncatedText) - stringDisplayWidth(rightText)} chars`);
    
    // The non-syntax highlighted approach:
    const nonSyntaxOutput = padEndDisplay(' ' + rightText, paneWidth);
    
    // The syntax highlighted approach:
    const leadingSpace = ' ';
    const syntaxText = truncatedText; // Assume syntax highlighting keeps same width
    const padding = ' '.repeat(Math.max(0, paneWidth - stringDisplayWidth(truncatedText) - 1));
    const syntaxOutput = leadingSpace + syntaxText + padding;
    
    console.log(`\\nFinal outputs:`);
    console.log(`  Non-syntax: "${nonSyntaxOutput}" (${stringDisplayWidth(nonSyntaxOutput)} chars)`);
    console.log(`  Syntax:     "${syntaxOutput}" (${stringDisplayWidth(syntaxOutput)} chars)`);
    
    // This test documents the problem - they should be the same width but aren't
    const nonSyntaxWidth = stringDisplayWidth(nonSyntaxOutput);
    const syntaxWidth = stringDisplayWidth(syntaxOutput);
    
    if (nonSyntaxWidth !== syntaxWidth) {
      console.log(`\\nPROBLEM CONFIRMED: Width difference of ${syntaxWidth - nonSyntaxWidth} characters!`);
      console.log(`This is the off-by-one error mentioned by the user.`);
    }
    
    // Both should be exactly paneWidth
    expect(nonSyntaxWidth).toBe(paneWidth);
    expect(syntaxWidth).toBe(paneWidth);
  });
});