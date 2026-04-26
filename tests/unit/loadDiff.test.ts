import {describe, test, expect, jest, beforeEach, afterEach} from '@jest/globals';
import * as commandExecutor from '../../src/shared/utils/commandExecutor.js';
import {loadDiff, parseUnifiedDiff} from '../../src/shared/utils/diff/loadDiff.js';

describe('parseUnifiedDiff', () => {
  test('returns an empty map for empty input', () => {
    expect(parseUnifiedDiff('').size).toBe(0);
    expect(parseUnifiedDiff('   ').size).toBe(0);
  });

  test('parses a simple single-file diff with file and hunk headers', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index abc..def 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -10,3 +10,4 @@ function foo() {',
      ' context1',
      '-old',
      '+new',
      ' context2',
    ].join('\n');

    const result = parseUnifiedDiff(diff);
    const lines = result.get('src/foo.ts');
    expect(lines).toBeDefined();

    expect(lines![0]).toMatchObject({type: 'header', headerType: 'file', fileName: 'src/foo.ts'});
    const hunk = lines!.find(l => l.type === 'header' && l.headerType === 'hunk');
    expect(hunk?.text).toContain('function foo()');
  });

  test('tracks line counters from the hunk header', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -5,2 +8,3 @@',
      ' ctx',
      '+added',
      ' after',
    ].join('\n');

    const lines = parseUnifiedDiff(diff).get('x.ts')!;
    const context = lines.filter(l => l.type === 'context');
    const added = lines.filter(l => l.type === 'added');

    expect(context[0].oldLineIndex).toBe(5);
    expect(context[0].newLineIndex).toBe(8);
    expect(added[0].newLineIndex).toBe(9);
    // Second context line's old/new advance by 1 and 2 (skipping over the added line)
    expect(context[1].oldLineIndex).toBe(6);
    expect(context[1].newLineIndex).toBe(10);
  });

  test('marks + and - lines, ignoring +++/--- headers', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');
    const lines = parseUnifiedDiff(diff).get('a.ts')!;
    expect(lines.some(l => l.type === 'removed' && l.text === 'old')).toBe(true);
    expect(lines.some(l => l.type === 'added' && l.text === 'new')).toBe(true);
    // +++/--- should not produce added/removed rows
    expect(lines.filter(l => l.text?.startsWith('+') || l.text?.startsWith('-'))).toHaveLength(0);
  });

  test('splits multiple files into separate entries', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1 @@',
      '-a_old',
      '+a_new',
      'diff --git a/b.ts b/b.ts',
      '--- a/b.ts',
      '+++ b/b.ts',
      '@@ -1 +1 @@',
      '-b_old',
      '+b_new',
    ].join('\n');
    const result = parseUnifiedDiff(diff);
    expect(Array.from(result.keys()).sort()).toEqual(['a.ts', 'b.ts']);
    expect(result.get('a.ts')!.some(l => l.text === 'a_new')).toBe(true);
    expect(result.get('b.ts')!.some(l => l.text === 'b_new')).toBe(true);
  });

  test('preserves blank lines inside the diff as context with a space', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,2 +1,2 @@',
      ' first',
      '',
      ' second',
    ].join('\n');
    const lines = parseUnifiedDiff(diff).get('x.ts')!;
    const blank = lines.find(l => l.type === 'context' && l.text === ' ');
    expect(blank).toBeDefined();
  });
});

describe('loadDiff', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows a placeholder for untracked binary files', async () => {
    const runCommandAsync = jest.spyOn(commandExecutor, 'runCommandAsync').mockImplementation(async (args) => {
      const command = args.join(' ');
      if (command.includes('git diff --no-color --no-ext-diff')) return '';
      if (command.includes('ls-files --others --exclude-standard')) return 'image.png';
      if (command.includes('git diff --no-index --numstat -- /dev/null "image.png"')) return '-\t-\timage.png';
      if (command.includes('sed -n')) return 'PNG_BINARY_CONTENT';
      return '';
    });

    const lines = await loadDiff('/tmp/worktree', 'uncommitted');

    expect(runCommandAsync).toHaveBeenCalled();
    expect(lines).toEqual([
      {type: 'header', text: '📁 image.png (new file)', fileName: 'image.png', headerType: 'file'},
      {type: 'context', text: 'Binary file not shown', fileName: 'image.png'},
    ]);
  });

  test('keeps preview lines for untracked text files', async () => {
    jest.spyOn(commandExecutor, 'runCommandAsync').mockImplementation(async (args) => {
      const command = args.join(' ');
      if (command.includes('git diff --no-color --no-ext-diff')) return '';
      if (command.includes('ls-files --others --exclude-standard')) return 'notes.txt';
      if (command.includes('git diff --no-index --numstat -- /dev/null "notes.txt"')) return '2\t0\tnotes.txt';
      if (command.includes('sed -n')) return 'hello\nworld';
      return '';
    });

    const lines = await loadDiff('/tmp/worktree', 'uncommitted');

    expect(lines).toEqual([
      {type: 'header', text: '📁 notes.txt (new file)', fileName: 'notes.txt', headerType: 'file'},
      {type: 'added', text: 'hello', fileName: 'notes.txt'},
      {type: 'added', text: 'world', fileName: 'notes.txt'},
    ]);
  });
});
