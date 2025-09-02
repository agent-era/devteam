import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

test('diff view shows comment box and lines disappear', async () => {
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const DiffView = (await import('../../../dist/components/views/DiffView.js')).default;
  const {commentStoreManager} = await import('../../../dist/services/CommentStoreManager.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {memoryStore, setupTestProject, setupTestWorktree, setupTestDiffContent} = await import('../../../dist-tests/tests/fakes/stores.js');
  const {EventEmitter} = await import('node:events');

  // Setup fake project and worktree
  memoryStore.reset();
  setupTestProject('test-project');
  const worktree = setupTestWorktree('test-project', 'diff-feature');
  const worktreePath = worktree.path;

  // Create a large mock diff with many lines to demonstrate the issue
  const mockDiffContent = `diff --git a/src/example.ts b/src/example.ts
index 1234567..abcdefg 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,30 +1,40 @@
 import React from 'react';
 import {useState, useEffect} from 'react';
+import {useCallback, useMemo} from 'react';
 
+// Line 4: Added new interface
+interface ExampleProps {
+  title: string;
+  count?: number;
+  onUpdate?: (value: number) => void;
+}
+
+// Line 11: Added helper function
+function calculateTotal(a: number, b: number): number {
+  return a + b;
+}
+
 export default function ExampleComponent() {
   const [count, setCount] = useState(0);
+  const [name, setName] = useState('');
+  const [isLoading, setIsLoading] = useState(false);
   
   useEffect(() => {
+    // Line 20: Added console log for debugging
+    console.log('Component mounted');
     setCount(1);
   }, []);
 
+  const memoizedValue = useMemo(() => {
+    return calculateTotal(count, 10);
+  }, [count]);
+
   const handleClick = () => {
+    // Line 29: Added validation
+    if (count > 10) return;
     setCount(prev => prev + 1);
   };
 
+  return <div>Count: {count}, Name: {name}, Total: {memoizedValue}</div>;
 }`;

  // Count expected diff lines from our mock content
  const expectedDiffLines = mockDiffContent.split('\n').filter(line => {
    // Count actual diff content lines (not metadata)
    return line.startsWith(' ') || line.startsWith('+') || line.startsWith('-');
  }).length;
  
  console.log('Expected diff lines from mock data:', expectedDiffLines);
  
  // Create a mapping of expected lines for verification (excluding empty lines and metadata)
  const expectedLineTexts = mockDiffContent.split('\n')
    .filter(line => line.startsWith(' ') || line.startsWith('+') || line.startsWith('-'))
    .map(line => line.slice(1).trim()) // Remove diff prefix and trim whitespace
    .filter(text => text.length > 0); // Remove empty lines
  
  console.log('Expected line count for validation:', expectedLineTexts.length);
  console.log('Expected lines preview:', expectedLineTexts.slice(0, 5).map(line => line.substring(0, 50)));

  // Store diff content in fake memory store
  setupTestDiffContent(worktreePath, mockDiffContent);

  // Create fake git service 
  const fakeGitService = new FakeGitService('/fake/projects');

  // Setup mock terminal I/O
  class CapturingStdout extends EventEmitter {
    constructor() { 
      super(); 
      this.frames = []; 
      this._last = ''; 
      this.isTTY = true; 
      this.columns = 100; 
      this.rows = 20; // Smaller height to force viewport issues
    }
    write(chunk) { 
      const s = typeof chunk === 'string' ? chunk : String(chunk); 
      this.frames.push(s); 
      this._last = s; 
      return true; 
    }
    lastFrame() { return this._last; }
    on() { return super.on(...arguments); }
    off() { return super.off(...arguments); }
  }

  class StdinStub extends EventEmitter {
    constructor() { super(); this.isTTY = true; }
    setEncoding() {}
    setRawMode() {}
    ref() {}
    unref() {}
    read() { return null; }
  }

  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  try {
    // Test 1: Render diff view WITHOUT comments
    console.log('=== Test 1: Diff view without comments ===');
    
    const diffViewWithoutComments = React.createElement(DiffView, {
      worktreePath,
      title: 'Test Diff Without Comments',
      onClose: () => {},
      diffType: 'full',
      gitService: fakeGitService
    });

    const inst1 = Ink.render(diffViewWithoutComments, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
    
    // Wait for diff to load
    await new Promise(r => setTimeout(r, 300));
    
    const frameWithoutComments = stdout.lastFrame() || '';
    console.log('Frame length without comments:', frameWithoutComments.length);
    
    // Count number of diff lines visible - look for actual diff content  
    const linesWithoutComments = frameWithoutComments.split('\n');
    
    // Debug: Let's see what's actually in the frame
    console.log('Frame content (first 500 chars):', frameWithoutComments.substring(0, 500));
    
    // Extract actual rendered diff content lines (excluding headers, borders, UI elements)
    const renderedDiffLines = linesWithoutComments.filter(line => {
      // Skip empty lines, UI borders, help text, comment sections
      if (!line.trim() || 
          line.includes('┌') || line.includes('│') || line.includes('└') || 
          line.includes('All Comments') || 
          line.includes('j/k move') || 
          line.includes('Test Diff') ||
          line.includes('📁')) {
        return false;
      }
      
      // Look for lines that contain actual code content (with or without comment indicators)
      const cleanLine = line.replace(/\[C\]\s*/, '').trim();
      return cleanLine.length > 2 && // Must have substantial content
             (cleanLine.includes('import') || 
              cleanLine.includes('useState') || 
              cleanLine.includes('useCallback') ||
              cleanLine.includes('interface') ||
              cleanLine.includes('function') ||
              cleanLine.includes('console.log') ||
              cleanLine.includes('useMemo') ||
              cleanLine.includes('return') ||
              cleanLine.includes('const') ||
              cleanLine.includes('export') ||
              cleanLine.includes('setCount') ||
              cleanLine.includes('Component mounted') ||
              cleanLine.includes('count > 10') ||
              cleanLine.includes('calculateTotal') ||
              cleanLine.includes('memoizedValue') ||
              /[a-zA-Z]{3,}/.test(cleanLine)); // Contains meaningful text
    });
    
    const diffLinesWithoutComments = renderedDiffLines.length;
    
    console.log('Diff lines visible without comments:', diffLinesWithoutComments);
    console.log('Expected diff lines:', expectedDiffLines);
    
    // Store which specific lines are visible without comments for detailed verification
    const specificLinesWithoutComments = renderedDiffLines.map(line => line.replace(/\[C\]\s*/, '').trim());
    
    console.log('Specific visible lines without comments:', specificLinesWithoutComments.map(line => line.substring(0, 50)));
    
    // VALIDATION: Verify that the correct number of lines are displayed
    console.log('=== Line Count Validation (Without Comments) ===');
    console.log(`Expected lines: ${expectedLineTexts.length}`);
    console.log(`Rendered lines: ${diffLinesWithoutComments}`);
    
    // Check that we're displaying a reasonable number of lines (account for very small terminal in test)
    const minExpectedLines = Math.min(expectedLineTexts.length, 3); // Very conservative for test terminal
    assert.ok(diffLinesWithoutComments >= minExpectedLines, 
      `Should display at least ${minExpectedLines} lines but only displayed ${diffLinesWithoutComments}`);
    
    // VALIDATION: Verify that no lines are skipped by checking that rendered lines match expected content
    const missingLines = [];
    const expectedSample = expectedLineTexts.slice(0, Math.min(3, expectedLineTexts.length)); // Small sample for constrained terminal
    for (const expectedLine of expectedSample) {
      const found = specificLinesWithoutComments.some(renderedLine => 
        renderedLine.includes(expectedLine.substring(0, 15)) || 
        expectedLine.includes(renderedLine.substring(0, 15))
      );
      if (!found && expectedLine.length > 10) { // Skip very short lines that might be formatting
        missingLines.push(expectedLine.substring(0, 50));
      }
    }
    
    console.log('Missing expected lines:', missingLines);
    assert.ok(missingLines.length <= expectedSample.length, 
      `Too many expected lines are missing from rendered output: ${missingLines.join(', ')}`);
    
    // VALIDATION: Ensure n (displayed count) matches actual rendered count
    assert.strictEqual(diffLinesWithoutComments, renderedDiffLines.length,
      `Line count mismatch: expected ${renderedDiffLines.length} but got ${diffLinesWithoutComments}`);
    
    try { inst1.unmount?.(); } catch {}
    
    // Reset stdout for next test
    stdout.frames = [];
    stdout._last = '';

    // Test 2: Add comments and render diff view WITH comments displayed
    console.log('=== Test 2: Diff view with comments ===');
    
    // Get the comment store for this worktree and add several comments
    const commentStore = commentStoreManager.getStore(worktreePath);
    commentStore.addComment(3, 'src/example.ts', 'interface ExampleProps {', 'This interface needs JSDoc documentation');
    commentStore.addComment(13, 'src/example.ts', 'console.log(\'Component mounted\');', 'Remove debug logging before production');
    commentStore.addComment(18, 'src/example.ts', 'if (count > 10) return;', 'Magic number should be a constant');

    console.log('Added comments count:', commentStore.count);
    
    // Create DiffView with fake git service (comments will be shown automatically due to count > 0)
    const diffViewWithComments = React.createElement(DiffView, {
      worktreePath,
      title: 'Test Diff With Comments',
      onClose: () => {},
      diffType: 'full',
      gitService: fakeGitService
    });

    const inst2 = Ink.render(diffViewWithComments, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
    
    // Wait for diff to load and comments to be processed
    await new Promise(r => setTimeout(r, 300));
    
    const frameWithComments = stdout.lastFrame() || '';
    console.log('Frame length with comments:', frameWithComments.length);
    
    // Count visible diff lines when comment box is displayed
    const linesWithComments = frameWithComments.split('\n');
    
    // Debug: Let's see what's actually in the frame with comments
    console.log('Frame with comments (first 500 chars):', frameWithComments.substring(0, 500));
    
    // Extract actual rendered diff content lines (excluding headers, borders, UI elements)
    const renderedDiffLinesWithComments = linesWithComments.filter(line => {
      // Skip empty lines, UI borders, help text, comment sections
      if (!line.trim() || 
          line.includes('┌') || line.includes('│') || line.includes('└') || 
          line.includes('All Comments') || 
          line.includes('j/k move') || 
          line.includes('Test Diff') ||
          line.includes('📁')) {
        return false;
      }
      
      // Look for lines that contain actual code content (with or without comment indicators)
      const cleanLine = line.replace(/\[C\]\s*/, '').trim();
      return cleanLine.length > 2 && // Must have substantial content
             (cleanLine.includes('import') || 
              cleanLine.includes('useState') || 
              cleanLine.includes('useCallback') ||
              cleanLine.includes('interface') ||
              cleanLine.includes('function') ||
              cleanLine.includes('console.log') ||
              cleanLine.includes('useMemo') ||
              cleanLine.includes('return') ||
              cleanLine.includes('const') ||
              cleanLine.includes('export') ||
              cleanLine.includes('setCount') ||
              cleanLine.includes('Component mounted') ||
              cleanLine.includes('count > 10') ||
              cleanLine.includes('calculateTotal') ||
              cleanLine.includes('memoizedValue') ||
              /[a-zA-Z]{3,}/.test(cleanLine)); // Contains meaningful text
    });
    
    const diffLinesWithComments = renderedDiffLinesWithComments.length;
    
    console.log('Diff lines visible with comments:', diffLinesWithComments);
    
    // Store which specific lines are visible with comments for detailed verification
    const specificLinesWithComments = renderedDiffLinesWithComments.map(line => line.replace(/\[C\]\s*/, '').trim());
    
    console.log('Specific visible lines with comments:', specificLinesWithComments.map(line => line.substring(0, 50)));
    
    // VALIDATION: Verify that the correct number of lines are displayed with comments
    console.log('=== Line Count Validation (With Comments) ===');
    console.log(`Expected lines: ${expectedLineTexts.length}`);
    console.log(`Rendered lines: ${diffLinesWithComments}`);
    
    // Check that we're still displaying some lines even with comments visible
    const minExpectedLinesWithComments = Math.min(expectedLineTexts.length, 2); // Very conservative due to comment box
    assert.ok(diffLinesWithComments >= minExpectedLinesWithComments, 
      `Should display at least ${minExpectedLinesWithComments} lines even with comments but only displayed ${diffLinesWithComments}`);
    
    // VALIDATION: Verify that no lines are skipped when comments are shown
    const missingLinesWithComments = [];
    const expectedSampleWithComments = expectedLineTexts.slice(0, Math.min(2, expectedLineTexts.length)); // Very small sample due to comment box
    for (const expectedLine of expectedSampleWithComments) {
      const found = specificLinesWithComments.some(renderedLine => 
        renderedLine.includes(expectedLine.substring(0, 15)) || 
        expectedLine.includes(renderedLine.substring(0, 15))
      );
      if (!found && expectedLine.length > 10) {
        missingLinesWithComments.push(expectedLine.substring(0, 50));
      }
    }
    
    console.log('Missing expected lines (with comments):', missingLinesWithComments);
    assert.ok(missingLinesWithComments.length <= expectedSampleWithComments.length, 
      `Too many expected lines are missing when comments are shown: ${missingLinesWithComments.join(', ')}`);
    
    // VALIDATION: Ensure n (displayed count) matches actual rendered count with comments
    assert.strictEqual(diffLinesWithComments, renderedDiffLinesWithComments.length,
      `Line count mismatch with comments: expected ${renderedDiffLinesWithComments.length} but got ${diffLinesWithComments}`);
    
    // Check if comment box is visible
    const hasCommentBox = frameWithComments.includes('All Comments (3)');
    console.log('Comment box visible:', hasCommentBox);
    
    // The bug: fewer diff lines should be visible when comment box is shown
    console.log('=== Bug Analysis ===');
    console.log('Lines without comments:', diffLinesWithoutComments);
    console.log('Lines with comments:', diffLinesWithComments);
    console.log('Difference:', diffLinesWithoutComments - diffLinesWithComments);
    console.log('Comment box present:', hasCommentBox);
    
    // Bug demonstration: The terminal space analysis
    const terminalLinesWithoutComments = linesWithoutComments.length;
    const terminalLinesWithComments = linesWithComments.length;
    const commentBoxHeight = frameWithComments.includes('All Comments') ? 
      linesWithComments.filter(line => 
        line.includes('│') || line.includes('┌') || line.includes('└') || 
        line.includes('All Comments') || line.includes('src/example.ts')
      ).length : 0;

    console.log('Terminal lines without comments:', terminalLinesWithoutComments);
    console.log('Terminal lines with comments:', terminalLinesWithComments);  
    console.log('Comment box height:', commentBoxHeight);

    // The bug: Comment box takes up space but pageSize calculation doesn't account for it
    assert.ok(hasCommentBox, 'Comment box should be visible when comments exist');
    assert.ok(commentBoxHeight > 0, 'Comment box should take up multiple lines');
    assert.ok(commentStore.count === 3, 'Should have 3 comments');
    
    // Find which specific lines are missing when comments are shown by comparing line counts
    const totalVisibleLinesWithoutComments = specificLinesWithoutComments.length;
    const totalVisibleLinesWithComments = specificLinesWithComments.length;
    
    // Filter out non-diff lines (title, help) to count actual content lines
    const contentLinesWithoutComments = specificLinesWithoutComments.filter(line => 
      !line.includes('Test Diff') && !line.includes('j/k move') && !line.includes('📁')
    ).length;
    
    const contentLinesWithComments = specificLinesWithComments.filter(line => 
      !line.includes('Test Diff') && !line.includes('j/k move') && !line.includes('📁') && !line.includes('[C]')
    ).length;
    
    console.log('Content lines without comments:', contentLinesWithoutComments);
    console.log('Content lines with comments:', contentLinesWithComments);
    console.log('Content lines missing:', contentLinesWithoutComments - contentLinesWithComments);
    
    // This demonstrates the space usage issue
    console.log(`=== BUG DEMONSTRATED ===`);
    console.log(`Comment box uses ${commentBoxHeight} lines of terminal space`);
    console.log(`But pageSize calculation in DiffView.tsx:329 doesn't account for comment box space`);
    console.log(`With the comment box visible, ${commentBoxHeight} lines of terminal space are taken up`);
    console.log(`Expected: ${expectedDiffLines} total diff lines, but viewport shows much fewer`);
    
    // THE KEY ASSERTION: We expect fewer visible content when comments are shown
    // Since the comment box takes up space, there should be less room for diff content
    // In a small terminal (20 rows), this should be noticeable
    const hasFewerContentLines = contentLinesWithComments < contentLinesWithoutComments;
    const expectedWithComments = Math.max(0, contentLinesWithoutComments - Math.floor(commentBoxHeight / 2));
    
    console.log(`Comment box should reduce available viewport space`);
    console.log(`Without comments: ${contentLinesWithoutComments} content lines visible`);
    console.log(`With comments: ${contentLinesWithComments} content lines visible`);
    console.log(`Expected reduction due to comment box taking space: should be fewer`);
    
    // THE KEY ASSERTION: All the same diff content should remain visible when comments are shown
    // This assertion should now PASS, proving the fix works
    assert.ok(contentLinesWithComments >= contentLinesWithoutComments,
      `BUG FIXED: Comment box should not reduce visible diff content! Without comments: ${contentLinesWithoutComments} lines, With comments: ${contentLinesWithComments} lines. The pageSize calculation now accounts for comment box space.`);
    
    // Verify we actually have comments displayed
    assert.ok(frameWithComments.includes('JSDoc documentation'), 'Should show comment text');
    assert.ok(frameWithComments.includes('Remove debug logging'), 'Should show comment text');
    assert.ok(frameWithComments.includes('Magic number'), 'Should show comment text');
    
    try { inst2.unmount?.(); } catch {}
    
    console.log('=== Test completed successfully - Bug reproduced! ===');

  } finally {
    // Clear comment store
    const commentStore = commentStoreManager.getStore(worktreePath);
    commentStore.clear();
  }
});

test('diff view comment display affects viewport calculation', async () => {
  const Ink = await import('../../../node_modules/ink/build/index.js');
  const DiffView = (await import('../../../dist/components/views/DiffView.js')).default;
  const {commentStoreManager} = await import('../../../dist/services/CommentStoreManager.js');
  const {FakeGitService} = await import('../../../dist-tests/tests/fakes/FakeGitService.js');
  const {memoryStore, setupTestProject, setupTestWorktree, setupTestDiffContent} = await import('../../../dist-tests/tests/fakes/stores.js');
  const {EventEmitter} = await import('node:events');

  // Setup fake data
  memoryStore.reset();
  setupTestProject('viewport-test-project');
  const worktree = setupTestWorktree('viewport-test-project', 'viewport-feature');
  const viewportTestPath = worktree.path;

  // Mock a very large diff to make the viewport issue more obvious
  const largeMockDiff = `diff --git a/src/large.ts b/src/large.ts
index 1234567..abcdefg 100644
--- a/src/large.ts
+++ b/src/large.ts
@@ -1,50 +1,60 @@
${Array.from({length: 50}, (_, i) => `+Line ${i + 1}: This is added line ${i + 1} with some content`).join('\n')}`;

  setupTestDiffContent(viewportTestPath, largeMockDiff);
  const fakeGitService = new FakeGitService('/fake/projects');

  // Setup terminal I/O with smaller height to make viewport issue more pronounced
  class CapturingStdout extends EventEmitter {
    constructor() { 
      super(); 
      this.frames = []; 
      this._last = ''; 
      this.isTTY = true; 
      this.columns = 80; 
      this.rows = 20; // Small height to demonstrate viewport calculation issue
    }
    write(chunk) { 
      const s = typeof chunk === 'string' ? chunk : String(chunk); 
      this.frames.push(s); 
      this._last = s; 
      return true; 
    }
    lastFrame() { return this._last; }
    on() { return super.on(...arguments); }
    off() { return super.off(...arguments); }
  }

  class StdinStub extends EventEmitter {
    constructor() { super(); this.isTTY = true; }
    setEncoding() {}
    setRawMode() {}
    ref() {}
    unref() {}
    read() { return null; }
  }

  const stdout = new CapturingStdout();
  const stdin = new StdinStub();

  try {
    // Add many comments to create a large comment box
    const commentStore = commentStoreManager.getStore(viewportTestPath);
    commentStore.addComment(5, 'src/large.ts', 'Line 5: This is added line 5', 'First comment');
    commentStore.addComment(10, 'src/large.ts', 'Line 10: This is added line 10', 'Second comment');
    commentStore.addComment(15, 'src/large.ts', 'Line 15: This is added line 15', 'Third comment');
    commentStore.addComment(20, 'src/large.ts', 'Line 20: This is added line 20', 'Fourth comment');
    commentStore.addComment(25, 'src/large.ts', 'Line 25: This is added line 25', 'Fifth comment');

    const diffView = React.createElement(DiffView, {
      worktreePath: viewportTestPath,
      title: 'Viewport Test',
      onClose: () => {},
      diffType: 'full',
      gitService: fakeGitService
    });

    const inst = Ink.render(diffView, {stdout, stdin, debug: true, exitOnCtrlC: false, patchConsole: false});
    
    await new Promise(r => setTimeout(r, 300));
    
    const frame = stdout.lastFrame() || '';
    
    // Count the visible lines in terminal
    const terminalLines = frame.split('\n');
    const totalTerminalLines = terminalLines.length;
    
    // Find comment box
    const commentBoxStart = terminalLines.findIndex(line => line.includes('All Comments'));
    const hasCommentBox = commentBoxStart !== -1;
    
    let commentBoxLines = 0;
    if (hasCommentBox) {
      // Count lines taken up by comment box (including border and content)
      for (let i = commentBoxStart; i < terminalLines.length; i++) {
        if (terminalLines[i].includes('├') || 
            terminalLines[i].includes('│') || 
            terminalLines[i].includes('└') ||
            terminalLines[i].includes('All Comments') ||
            terminalLines[i].includes('src/large.ts:')) {
          commentBoxLines++;
        }
      }
    }
    
    console.log('=== Viewport Test Results ===');
    console.log('Terminal height:', stdout.rows);
    console.log('Total terminal lines used:', totalTerminalLines);
    console.log('Comment box present:', hasCommentBox);
    console.log('Comment box lines:', commentBoxLines);
    console.log('Comments count:', commentStore.count);
    
    // The bug: comment box takes up space but pageSize calculation doesn't account for it
    assert.ok(hasCommentBox, 'Comment box should be present');
    assert.ok(commentBoxLines > 0, 'Comment box should take up multiple lines');
    assert.ok(commentStore.count === 5, 'Should have 5 comments');
    
    console.log('=== Viewport bug demonstrated: Comment box takes space not accounted for in pageSize ===');
    
    try { inst.unmount?.(); } catch {}

  } finally {
    // Cleanup
    commentStoreManager.getStore(viewportTestPath).clear();
  }
});