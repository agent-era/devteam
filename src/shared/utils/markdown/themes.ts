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

// Palette guideline: every colour in a theme should sit at roughly the same
// perceived brightness, so headings don't read darker than the surrounding
// body / code / link spans. Heading colours are *always* explicit truecolor
// hex values picked from the high-luminance band — both the named-bright and
// named-standard ANSI variants render unpredictably on different dark-mode
// palettes (sometimes mapping the *Bright variant darker than the standard
// one), so we don't trust them for headings. Other roles (code, link, plain
// text) keep their named colours where the existing tests rely on them.

export const MARKDOWN_THEMES: MarkdownTheme[] = [
  {
    // Default: balanced primaries — all at the same brightness as `cyan` and
    // `yellow` (the link / code colours).
    name: 'bright',
    label: 'Bright — balanced primaries',
    heading: {1: '#00FFFF', 2: '#00FF7F', 3: '#FFFF66', 4: '#FF66FF', 5: '#66B3FF', 6: '#FFFFFF'},
    plainColor: 'gray',
    plainDim: false,
    codeColor: 'yellow',
    codeDim: true,
    linkColor: 'cyan',
    bulletColor: 'cyan',
    blockquoteBarColor: 'gray',
    blockquoteDim: true,
    dividerColor: 'magenta',
    tabActiveColor: 'cyan',
    tabReadyColor: 'white',
    tabPendingColor: 'yellow',
    tabExtraColor: 'magenta',
  },
  {
    // Greens dominant, but with gold + purple complements per heading level
    // so the strip reads as a multi-colour gradient rather than monochrome.
    name: 'forest',
    label: 'Forest — greens with gold + purple accents',
    heading: {1: '#ADFF2F', 2: '#7FFF00', 3: '#FFD700', 4: '#FFB347', 5: '#DA70D6', 6: '#F5F5DC'},
    plainColor: '#B0B0B0',
    plainDim: false,
    codeColor: '#DAA520',
    codeDim: false,
    linkColor: '#7FFFD4',
    bulletColor: '#7CFC00',
    blockquoteBarColor: '#556B2F',
    blockquoteDim: true,
    dividerColor: '#7FFFD4',
    tabActiveColor: '#7CFC00',
    tabReadyColor: '#B0B0B0',
    tabPendingColor: '#FFD700',
    tabExtraColor: '#9370DB',
  },
  {
    // Warm sunset: corals, oranges, golds, pink + purple highlight.
    name: 'sunset',
    label: 'Sunset — corals, oranges, gold, pink',
    heading: {1: '#FF8A80', 2: '#FFB347', 3: '#FFD966', 4: '#FF85C2', 5: '#DA70D6', 6: '#87CEEB'},
    plainColor: '#D2B48C',
    plainDim: false,
    codeColor: '#FF8C00',
    codeDim: false,
    linkColor: '#FFD700',
    bulletColor: '#FFB347',
    blockquoteBarColor: '#8B4513',
    blockquoteDim: true,
    dividerColor: '#FF6B6B',
    tabActiveColor: '#FFD700',
    tabReadyColor: '#D2B48C',
    tabPendingColor: '#FF6B6B',
    tabExtraColor: '#FF69B4',
  },
  {
    // Cool ocean: blues, cyans, teal — and a coral/gold accent so it isn't
    // monochrome.
    name: 'ocean',
    label: 'Ocean — blues, cyans, gold accents',
    heading: {1: '#66B3FF', 2: '#5EE8EB', 3: '#7FFFD4', 4: '#FFA07A', 5: '#FFD966', 6: '#DA70D6'},
    plainColor: '#B0C4DE',
    plainDim: false,
    codeColor: '#48D1CC',
    codeDim: false,
    linkColor: '#FFD700',
    bulletColor: '#00CED1',
    blockquoteBarColor: '#4682B4',
    blockquoteDim: true,
    dividerColor: '#1E90FF',
    tabActiveColor: '#00CED1',
    tabReadyColor: '#B0C4DE',
    tabPendingColor: '#FFD700',
    tabExtraColor: '#FF7F50',
  },
  {
    // Synthwave-ish: hot pink, cyan, lime, purple — saturated pop colours.
    name: 'neon',
    label: 'Neon — pink, cyan, lime, purple',
    heading: {1: '#FF66B2', 2: '#00FFFF', 3: '#FFFF66', 4: '#DA70D6', 5: '#ADFF2F', 6: '#FFA94D'},
    plainColor: '#E0E0E0',
    plainDim: false,
    codeColor: '#FF1493',
    codeDim: false,
    linkColor: '#00FFFF',
    bulletColor: '#FFFF00',
    blockquoteBarColor: '#9370DB',
    blockquoteDim: true,
    dividerColor: '#FF1493',
    tabActiveColor: '#00FFFF',
    tabReadyColor: '#E0E0E0',
    tabPendingColor: '#FF1493',
    tabExtraColor: '#7FFF00',
  },
  {
    // Warm autumn — tomato, orange, gold, chocolate, olive, plum.
    name: 'autumn',
    label: 'Autumn — tomato, gold, plum, olive',
    heading: {1: '#FF8A66', 2: '#FFA94D', 3: '#FFD966', 4: '#DA70D6', 5: '#98FB98', 6: '#DEB887'},
    plainColor: '#DEB887',
    plainDim: false,
    codeColor: '#D2691E',
    codeDim: false,
    linkColor: '#FFD700',
    bulletColor: '#FF8C00',
    blockquoteBarColor: '#A0522D',
    blockquoteDim: true,
    dividerColor: '#FF6347',
    tabActiveColor: '#FFD700',
    tabReadyColor: '#DEB887',
    tabPendingColor: '#FF6347',
    tabExtraColor: '#9370DB',
  },
  {
    // Candy / pop: pink, chartreuse, turquoise, purple, gold.
    name: 'candy',
    label: 'Candy — pink, lime, turquoise, gold',
    heading: {1: '#FF85C2', 2: '#ADFF2F', 3: '#FFD966', 4: '#5EE8EB', 5: '#DA70D6', 6: '#FFA94D'},
    plainColor: '#E6E6FA',
    plainDim: false,
    codeColor: '#FF69B4',
    codeDim: false,
    linkColor: '#7FFF00',
    bulletColor: '#FF69B4',
    blockquoteBarColor: '#9370DB',
    blockquoteDim: true,
    dividerColor: '#FF69B4',
    tabActiveColor: '#7FFF00',
    tabReadyColor: '#E6E6FA',
    tabPendingColor: '#FFD700',
    tabExtraColor: '#00CED1',
  },
  {
    // Black-and-white. Bold/italic/dim carry the hierarchy.
    name: 'mono',
    label: 'Mono — black & white',
    heading: {1: '#FFFFFF', 2: '#F5F5F5', 3: '#E0E0E0', 4: '#CCCCCC', 5: '#B8B8B8', 6: '#A0A0A0'},
    plainColor: undefined,
    plainDim: true,
    codeColor: 'white',
    codeDim: true,
    linkColor: 'white',
    bulletColor: 'white',
    blockquoteBarColor: 'gray',
    blockquoteDim: true,
    dividerColor: 'gray',
    tabActiveColor: 'white',
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
