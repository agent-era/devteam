export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  dim?: boolean;
  color?: string;
  inverse?: boolean;
}

export interface MdRow {
  spans: Span[];
}

export type BlockContext =
  | {kind: 'blank'}
  | {kind: 'para'}
  | {kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; textStart: number}
  | {kind: 'list'; indent: number; bullet: string; textStart: number; ordered: boolean}
  | {kind: 'blockquote'; textStart: number}
  | {kind: 'hr'}
  | {kind: 'code'; lang?: string; isFenceMarker: boolean};
