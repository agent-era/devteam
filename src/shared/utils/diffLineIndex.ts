export type UnifiedDiffLine = { type: 'added' | 'removed' | 'context' | 'header'; text: string; fileName?: string; headerType?: 'file' | 'hunk' };

export type SideBySideCell = { type: 'added' | 'removed' | 'context' | 'header' | 'empty'; text: string; fileName?: string; headerType?: 'file' | 'hunk' } | null;
export type SideBySideRow = { left: SideBySideCell; right: SideBySideCell; lineIndex: number };

// Returns array mapping each unified line index -> per-file 0-based line index, or undefined for lines without a file
export function computeUnifiedPerFileIndices(lines: UnifiedDiffLine[]): Array<number | undefined> {
  const map: Array<number | undefined> = new Array(lines.length);
  const counters = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const file = l.fileName || '';
    if (!file) { map[i] = undefined; continue; }
    if (l.type === 'header') {
      map[i] = counters.get(file);
      continue;
    }
    const prev = counters.get(file) || 0;
    map[i] = prev;
    counters.set(file, prev + 1);
  }
  return map;
}

// Returns array mapping each side-by-side row index -> per-file 0-based line index, or undefined for rows without a file
export function computeSideBySidePerFileIndices(rows: SideBySideRow[]): Array<number | undefined> {
  const map: Array<number | undefined> = new Array(rows.length);
  const counters = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const file = r.left?.fileName || r.right?.fileName || '';
    if (!file) { map[i] = undefined; continue; }
    const isHeader = (r.left?.type === 'header') || (r.right?.type === 'header');
    if (isHeader) {
      map[i] = counters.get(file);
      continue;
    }
    const prev = counters.get(file) || 0;
    map[i] = prev;
    counters.set(file, prev + 1);
  }
  return map;
}

