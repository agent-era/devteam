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
    // Use current-version line numbers: count only added or context lines
    if (l.type === 'removed') {
      map[i] = undefined;
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
    // Prefer right-side file name (current version)
    const file = r.right?.fileName || r.left?.fileName || '';
    if (!file) { map[i] = undefined; continue; }
    const isHeader = (r.left?.type === 'header') || (r.right?.type === 'header');
    if (isHeader) {
      map[i] = counters.get(file);
      continue;
    }
    // Map to current-version line numbers: only count rows that have a right cell (context/added)
    const hasRight = !!r.right && r.right.type !== 'empty';
    if (!hasRight) {
      map[i] = undefined;
      continue;
    }
    const prev = counters.get(file) || 0;
    map[i] = prev;
    counters.set(file, prev + 1);
  }
  return map;
}
