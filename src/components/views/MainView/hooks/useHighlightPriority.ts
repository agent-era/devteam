import {useMemo} from 'react';
import type {WorktreeInfo, PRStatus} from '../../../../models.js';
import {computeHighlightInfo, type HighlightInfo} from '../highlight.js';

export function useHighlightPriority(worktree: WorktreeInfo, pr: PRStatus | undefined | null): HighlightInfo | null {
  return useMemo(() => computeHighlightInfo(worktree, pr), [worktree, pr]);
}
