import {runCommandAsync} from '../commandExecutor.js';
import {findBaseBranch} from '../gitHelpers.js';
import {BASE_BRANCH_CANDIDATES} from '../../../constants.js';
import type {DiffLine, DiffType} from './types.js';

export function parseUnifiedDiff(diff: string): Map<string, DiffLine[]> {
  const fileContents = new Map<string, DiffLine[]>();
  if (!diff || !diff.trim()) return fileContents;

  const raw = diff.split('\n');
  let currentFileName = '';
  let currentFileLines: DiffLine[] = [];
  let oldLineCounter = 1;
  let newLineCounter = 1;

  for (const line of raw) {
    if (line.startsWith('diff --git')) {
      if (currentFileName && currentFileLines.length > 0) {
        fileContents.set(currentFileName, currentFileLines);
      }
      const parts = line.split(' ');
      const fp = parts[3]?.slice(2) || parts[2]?.slice(2) || '';
      currentFileName = fp;
      currentFileLines = [];
      currentFileLines.push({type: 'header', text: `📁 ${fp}`, fileName: fp, headerType: 'file'});
      oldLineCounter = 1;
      newLineCounter = 1;
    } else if (line.startsWith('@@')) {
      const m = line.match(/^@@ -([0-9]+)(?:,([0-9]+))? \+([0-9]+)(?:,([0-9]+))? @@/);
      if (m) {
        const oldStart = parseInt(m[1] || '1', 10);
        const newStart = parseInt(m[3] || '1', 10);
        oldLineCounter = Math.max(1, oldStart);
        newLineCounter = Math.max(1, newStart);
      }
      const ctx = line.replace(/^@@.*@@ ?/, '');
      if (ctx) currentFileLines.push({type: 'header', text: ` ▼ ${ctx}`, fileName: currentFileName, headerType: 'hunk'});
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      currentFileLines.push({type: 'added', text: line.slice(1), fileName: currentFileName, newLineIndex: newLineCounter});
      newLineCounter++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentFileLines.push({type: 'removed', text: line.slice(1), fileName: currentFileName, oldLineIndex: oldLineCounter});
      oldLineCounter++;
    } else if (line.startsWith(' ')) {
      currentFileLines.push({type: 'context', text: line.slice(1), fileName: currentFileName, oldLineIndex: oldLineCounter, newLineIndex: newLineCounter});
      oldLineCounter++;
      newLineCounter++;
    } else if (line === '') {
      currentFileLines.push({type: 'context', text: ' ', fileName: currentFileName});
    }
  }

  if (currentFileName && currentFileLines.length > 0) {
    fileContents.set(currentFileName, currentFileLines);
  }

  return fileContents;
}

export async function resolveBaseCommitHash(worktreePath: string, diffType: DiffType): Promise<string> {
  try {
    if (diffType === 'uncommitted') {
      return (await runCommandAsync(['git', '-C', worktreePath, 'rev-parse', 'HEAD']) || '').trim();
    }
    let ref = 'HEAD~1';
    const base = findBaseBranch(worktreePath, BASE_BRANCH_CANDIDATES);
    if (base) {
      const mb = await runCommandAsync(['git', '-C', worktreePath, 'merge-base', 'HEAD', base]);
      if (mb) ref = mb.trim();
    }
    return (await runCommandAsync(['git', '-C', worktreePath, 'rev-parse', ref]) || '').trim();
  } catch {
    return '';
  }
}

export async function loadDiff(worktreePath: string, diffType: DiffType = 'full', baseCommitHash?: string): Promise<DiffLine[]> {
  let diff: string | null = null;

  if (diffType === 'uncommitted') {
    diff = await runCommandAsync(['git', '-C', worktreePath, 'diff', '--no-color', '--no-ext-diff', 'HEAD']);
  } else {
    const target = baseCommitHash || (await resolveBaseCommitHash(worktreePath, 'full')) || 'HEAD~1';
    diff = await runCommandAsync(['git', '-C', worktreePath, 'diff', '--no-color', '--no-ext-diff', target]);
  }

  const fileContents = parseUnifiedDiff(diff || '');

  const untracked = await runCommandAsync(['git', '-C', worktreePath, 'ls-files', '--others', '--exclude-standard']);
  if (untracked) {
    for (const fp of untracked.split('\n').filter(Boolean)) {
      const fileLines: DiffLine[] = [];
      fileLines.push({type: 'header', text: `📁 ${fp} (new file)`, fileName: fp, headerType: 'file'});
      try {
        const cat = await runCommandAsync(['bash', '-lc', `cd ${JSON.stringify(worktreePath)} && sed -n '1,200p' ${JSON.stringify(fp)}`]);
        for (const l of (cat || '').split('\n')) {
          fileLines.push({type: 'added', text: l, fileName: fp});
        }
      } catch {}
      fileContents.set(fp, fileLines);
    }
  }

  const sortedFiles = Array.from(fileContents.keys()).sort();
  const lines: DiffLine[] = [];
  for (const fileName of sortedFiles) {
    const fileLines = fileContents.get(fileName);
    if (fileLines) lines.push(...fileLines);
  }

  return lines;
}
