import {runCommandQuick} from './commandExecutor.js';

export function parseGitShortstat(output: string): [number, number] {
  if (!output) return [0, 0];
  
  const addedMatch = /([0-9]+) insertion/.exec(output);
  const deletedMatch = /([0-9]+) deletion/.exec(output);
  
  const added = addedMatch ? Number(addedMatch[1]) : 0;
  const deleted = deletedMatch ? Number(deletedMatch[1]) : 0;
  
  return [added, deleted];
}

export function findBaseBranch(repoPath: string, candidates: string[] = ['main', 'master', 'develop']): string {
  // Try origin/candidate first
  for (const candidate of candidates) {
    const originBranch = `origin/${candidate}`;
    const output = runCommandQuick(['git', '-C', repoPath, 'rev-parse', '--verify', originBranch]);
    if (output) return originBranch;
  }
  
  // Then local branches
  for (const candidate of candidates) {
    const output = runCommandQuick(['git', '-C', repoPath, 'rev-parse', '--verify', candidate]);
    if (output) return candidate;
  }
  
  // Finally origin/HEAD
  const originHead = runCommandQuick(['git', '-C', repoPath, 'symbolic-ref', 'refs/remotes/origin/HEAD']);
  if (originHead && !/fatal/i.test(originHead)) {
    return originHead.trim().replace('refs/remotes/', '');
  }
  
  return '';
}