import fs from 'node:fs';
import path from 'node:path';
import {runCommandAsync} from '../commandExecutor.js';
import {computeBlockContext} from './blockContext.js';
import type {BlockContext} from './types.js';
import type {DiffLine} from '../diff/types.js';

export interface MdContextEntry {
  /** Block context indexed by 1-based line number in the post-image (working-copy). */
  post: BlockContext[] | null;
  /** Block context indexed by 1-based line number in the pre-image (base commit). */
  pre: BlockContext[] | null;
}

export type MdContextMap = Map<string, MdContextEntry>;

export function isMarkdownFile(fileName: string | undefined): boolean {
  if (!fileName) return false;
  const lower = fileName.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

async function readPostImage(worktreePath: string, fileName: string): Promise<string | null> {
  try {
    return fs.readFileSync(path.join(worktreePath, fileName), 'utf8');
  } catch {
    return null;
  }
}

async function readPreImage(worktreePath: string, fileName: string, baseHash: string): Promise<string | null> {
  if (!baseHash) return null;
  try {
    const out = await runCommandAsync(['git', '-C', worktreePath, 'show', `${baseHash}:${fileName}`]);
    return out ?? null;
  } catch {
    return null;
  }
}

/**
 * For each unique markdown file in the diff, fetch its post-image (the
 * working-copy contents) and pre-image (from the base commit) and run the
 * block-context scanner once over each. Callers pass the resulting map
 * down to the row renderers so per-line styling has the block context it
 * needs (e.g. "this line is inside a fenced code block — render plain").
 */
export async function buildMdContextMap(
  worktreePath: string,
  lines: DiffLine[],
  baseHash: string | undefined
): Promise<MdContextMap> {
  const map: MdContextMap = new Map();
  const seen = new Set<string>();
  for (const l of lines) {
    if (!l.fileName || !isMarkdownFile(l.fileName)) continue;
    if (seen.has(l.fileName)) continue;
    seen.add(l.fileName);
  }

  await Promise.all(Array.from(seen).map(async (fileName) => {
    const [postRaw, preRaw] = await Promise.all([
      readPostImage(worktreePath, fileName),
      readPreImage(worktreePath, fileName, baseHash || ''),
    ]);
    map.set(fileName, {
      post: postRaw !== null ? computeBlockContext(postRaw) : null,
      pre: preRaw !== null ? computeBlockContext(preRaw) : null,
    });
  }));

  return map;
}

/**
 * Look up the block context for a single diff line. Added/context lines
 * are read from the post-image; removed lines from the pre-image. Falls
 * back to a paragraph context if no map entry is available (e.g. when
 * the file couldn't be read), so the line still gets inline styling.
 */
export function lookupBlockContext(
  line: DiffLine,
  side: 'left' | 'right' | 'unified',
  mdMap: MdContextMap
): BlockContext | null {
  if (!line.fileName || !isMarkdownFile(line.fileName)) return null;
  if (line.type === 'header') return null;

  const entry = mdMap.get(line.fileName);
  if (!entry) return {kind: 'para'};

  if (line.type === 'removed' || side === 'left') {
    if (entry.pre && line.oldLineIndex !== undefined && entry.pre[line.oldLineIndex]) {
      return entry.pre[line.oldLineIndex];
    }
    return {kind: 'para'};
  }

  if (entry.post && line.newLineIndex !== undefined && entry.post[line.newLineIndex]) {
    return entry.post[line.newLineIndex];
  }
  // For untracked / new files where pre is missing but post exists, try post.
  if (entry.post && line.oldLineIndex !== undefined && entry.post[line.oldLineIndex]) {
    return entry.post[line.oldLineIndex];
  }
  return {kind: 'para'};
}
