export interface MarkdownTheme {
  name: string;
  label: string;
  /** Color per heading depth (1–6). */
  heading: Record<1 | 2 | 3 | 4 | 5 | 6, string>;
  /** Color for plain (unstyled) inline text. `undefined` = default fg. */
  plainColor?: string;
  /** Whether plain text gets the Ink `dimColor` flag. */
  plainDim?: boolean;
  /** Color for fenced + inline code. */
  codeColor: string;
  codeDim?: boolean;
  linkColor: string;
  /** Color for the leading bullet on list items. */
  bulletColor: string;
  /** Color for the leading "│ " bar on blockquotes. */
  blockquoteBarColor: string;
  /** Whether blockquote body text is rendered dim. */
  blockquoteDim?: boolean;
  /** Color for the section divider in the tracker detail screen. */
  dividerColor: string;
  /** Color for the active tab label. */
  tabActiveColor: string;
  /** Color for tabs that have content available. */
  tabReadyColor: string;
  /** Color for tabs whose content hasn't been written yet. */
  tabPendingColor: string;
  /** Color for "extra" markdown files appended after the canonical stages. */
  tabExtraColor: string;
}

export const MARKDOWN_THEMES: MarkdownTheme[] = [
  {
    // The default. Balanced bright palette, cyan link to keep existing tests stable.
    name: 'bright',
    label: 'Bright — balanced rainbow',
    heading: {1: 'cyanBright', 2: 'greenBright', 3: 'yellowBright', 4: 'magentaBright', 5: 'blueBright', 6: 'whiteBright'},
    plainColor: 'gray',
    plainDim: false,
    codeColor: 'yellow',
    codeDim: true,
    linkColor: 'cyan',
    bulletColor: 'cyanBright',
    blockquoteBarColor: 'gray',
    blockquoteDim: true,
    dividerColor: 'magentaBright',
    tabActiveColor: 'cyanBright',
    tabReadyColor: 'whiteBright',
    tabPendingColor: 'yellow',
    tabExtraColor: 'magenta',
  },
  {
    // Greens-dominant. Heading hierarchy reads as a forest gradient.
    name: 'forest',
    label: 'Forest — greens, gold accents',
    heading: {1: '#7CFC00', 2: '#32CD32', 3: '#9ACD32', 4: '#6B8E23', 5: '#556B2F', 6: '#808000'},
    plainColor: '#A9A9A9',
    plainDim: false,
    codeColor: '#DAA520',
    codeDim: false,
    linkColor: '#7FFFD4',
    bulletColor: '#7CFC00',
    blockquoteBarColor: '#556B2F',
    blockquoteDim: true,
    dividerColor: '#7CFC00',
    tabActiveColor: '#7FFFD4',
    tabReadyColor: '#9ACD32',
    tabPendingColor: '#DAA520',
    tabExtraColor: '#9370DB',
  },
  {
    // Warm reds and oranges. High contrast on dark terminals.
    name: 'sunset',
    label: 'Sunset — reds, oranges, yellows',
    heading: {1: '#FF4500', 2: '#FF8C00', 3: '#FFD700', 4: '#FFA07A', 5: '#CD5C5C', 6: '#8B4513'},
    plainColor: '#D2B48C',
    plainDim: false,
    codeColor: '#FF6347',
    codeDim: false,
    linkColor: '#FFA07A',
    bulletColor: '#FF8C00',
    blockquoteBarColor: '#8B4513',
    blockquoteDim: true,
    dividerColor: '#FF4500',
    tabActiveColor: '#FFD700',
    tabReadyColor: '#FFA07A',
    tabPendingColor: '#FF6347',
    tabExtraColor: '#DA70D6',
  },
  {
    // Blues and cyans. Calm, "deep water" feel.
    name: 'ocean',
    label: 'Ocean — blues and cyans',
    heading: {1: '#1E90FF', 2: '#00BFFF', 3: '#87CEEB', 4: '#5F9EA0', 5: '#4682B4', 6: '#708090'},
    plainColor: '#B0C4DE',
    plainDim: false,
    codeColor: '#48D1CC',
    codeDim: false,
    linkColor: '#7FFFD4',
    bulletColor: '#00BFFF',
    blockquoteBarColor: '#4682B4',
    blockquoteDim: true,
    dividerColor: '#1E90FF',
    tabActiveColor: '#00BFFF',
    tabReadyColor: '#87CEEB',
    tabPendingColor: '#FFD700',
    tabExtraColor: '#FF69B4',
  },
  {
    // Pinks/purples — synthwave-ish.
    name: 'neon',
    label: 'Neon — pinks, purples, cyans',
    heading: {1: '#FF1493', 2: '#FF69B4', 3: '#DA70D6', 4: '#9370DB', 5: '#7B68EE', 6: '#4B0082'},
    plainColor: '#E0E0E0',
    plainDim: false,
    codeColor: '#00FFFF',
    codeDim: false,
    linkColor: '#FF00FF',
    bulletColor: '#FF1493',
    blockquoteBarColor: '#4B0082',
    blockquoteDim: true,
    dividerColor: '#FF00FF',
    tabActiveColor: '#FF1493',
    tabReadyColor: '#E0E0E0',
    tabPendingColor: '#00FFFF',
    tabExtraColor: '#9370DB',
  },
  {
    // Black-and-white. Bold/italic carry the hierarchy.
    name: 'mono',
    label: 'Mono — black & white',
    heading: {1: 'whiteBright', 2: 'whiteBright', 3: 'white', 4: 'white', 5: 'gray', 6: 'gray'},
    plainColor: undefined,
    plainDim: true,
    codeColor: 'white',
    codeDim: true,
    linkColor: 'whiteBright',
    bulletColor: 'white',
    blockquoteBarColor: 'gray',
    blockquoteDim: true,
    dividerColor: 'gray',
    tabActiveColor: 'whiteBright',
    tabReadyColor: 'white',
    tabPendingColor: 'gray',
    tabExtraColor: 'gray',
  },
];

let activeIndex = 0;
const subscribers = new Set<() => void>();

export function getActiveMarkdownTheme(): MarkdownTheme {
  return MARKDOWN_THEMES[activeIndex];
}

export function cycleMarkdownTheme(): MarkdownTheme {
  activeIndex = (activeIndex + 1) % MARKDOWN_THEMES.length;
  for (const fn of subscribers) fn();
  return getActiveMarkdownTheme();
}

export function setMarkdownTheme(name: string): MarkdownTheme | null {
  const idx = MARKDOWN_THEMES.findIndex(t => t.name === name);
  if (idx < 0) return null;
  activeIndex = idx;
  for (const fn of subscribers) fn();
  return getActiveMarkdownTheme();
}

export function subscribeMarkdownTheme(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
