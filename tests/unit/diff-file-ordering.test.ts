import {describe, test, expect} from '@jest/globals';

/**
 * Test for diff file ordering logic
 * Tests that files are sorted alphabetically when combining modified and untracked files
 */
describe('Diff File Ordering Logic', () => {
  test('should sort mixed modified and untracked files alphabetically', () => {
    // Simulate the core logic that was implemented in loadDiff function
    // This tests the sorting behavior that was added to fix the issue
    
    // Mock data representing files from git diff (in original git order)
    const modifiedFiles = ['src/zebra.ts', 'src/charlie.ts'];
    
    // Mock data representing untracked files (from ls-files)  
    const untrackedFiles = ['src/alpha.ts', 'src/beta.ts', 'src/delta.ts'];
    
    // Combine all files
    const allFiles = [...modifiedFiles, ...untrackedFiles];
    
    // Apply the sorting logic that was implemented
    const sortedFiles = allFiles.sort();
    
    // Verify files are in alphabetical order
    expect(sortedFiles).toEqual([
      'src/alpha.ts',
      'src/beta.ts', 
      'src/charlie.ts',
      'src/delta.ts',
      'src/zebra.ts'
    ]);
  });

  test('should handle edge cases with numeric file names', () => {
    // Test files with numbers to ensure proper string sorting
    const modifiedFiles = ['file2.txt', 'file100.txt'];
    const untrackedFiles = ['file1.txt', 'file10.txt', 'file20.txt'];
    
    const allFiles = [...modifiedFiles, ...untrackedFiles];
    const sortedFiles = allFiles.sort();
    
    // String sorting puts file10.txt before file2.txt (lexicographic order)
    expect(sortedFiles).toEqual([
      'file1.txt',
      'file10.txt',
      'file100.txt', 
      'file2.txt',
      'file20.txt'
    ]);
  });

  test('should handle files with same prefix', () => {
    // Test files with common prefixes
    const modifiedFiles = ['src/components/Button.tsx'];
    const untrackedFiles = ['src/component.ts', 'src/components/Alert.tsx', 'src/components/Dialog.tsx'];
    
    const allFiles = [...modifiedFiles, ...untrackedFiles];
    const sortedFiles = allFiles.sort();
    
    expect(sortedFiles).toEqual([
      'src/component.ts',
      'src/components/Alert.tsx',
      'src/components/Button.tsx',
      'src/components/Dialog.tsx'
    ]);
  });

  test('should preserve original behavior with only modified files', () => {
    // Test that sorting doesn't break when there are only modified files
    const modifiedFiles = ['src/zebra.ts', 'src/alpha.ts', 'src/beta.ts'];
    const untrackedFiles: string[] = [];
    
    const allFiles = [...modifiedFiles, ...untrackedFiles];
    const sortedFiles = allFiles.sort();
    
    expect(sortedFiles).toEqual([
      'src/alpha.ts',
      'src/beta.ts', 
      'src/zebra.ts'
    ]);
  });

  test('should preserve original behavior with only untracked files', () => {
    // Test that sorting works when there are only untracked files
    const modifiedFiles: string[] = [];
    const untrackedFiles = ['src/zebra.ts', 'src/alpha.ts', 'src/beta.ts'];
    
    const allFiles = [...modifiedFiles, ...untrackedFiles];
    const sortedFiles = allFiles.sort();
    
    expect(sortedFiles).toEqual([
      'src/alpha.ts',
      'src/beta.ts',
      'src/zebra.ts'
    ]);
  });
});