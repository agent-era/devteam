export type DiffLine = {
  type: 'added' | 'removed' | 'context' | 'header';
  text: string;
  fileName?: string;
  headerType?: 'file' | 'hunk';
  oldLineIndex?: number;
  newLineIndex?: number;
};

export type SideBySideLine = {
  left: {
    type: 'removed' | 'context' | 'header' | 'empty';
    text: string;
    fileName?: string;
    headerType?: 'file' | 'hunk';
    oldLineIndex?: number;
    newLineIndex?: number;
  } | null;
  right: {
    type: 'added' | 'context' | 'header' | 'empty';
    text: string;
    fileName?: string;
    headerType?: 'file' | 'hunk';
    oldLineIndex?: number;
    newLineIndex?: number;
  } | null;
  lineIndex: number;
};

export type ViewMode = 'unified' | 'sidebyside';
export type WrapMode = 'truncate' | 'wrap';

export type DiffType = 'full' | 'uncommitted';
