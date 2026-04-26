export interface MarkdownTheme {
  name: string;
  label: string;
  /** Color per heading depth (1–6). Multi-colour per level. */
  heading: Record<1 | 2 | 3 | 4 | 5 | 6, string>;
  /**
   * Single hue for body text — regular, italic, inline code, links, blockquote
   * bodies. Inline code adds `dim` on top via `codeDim`. Leave undefined to
   * use the terminal's default foreground (e.g. `mono`).
   */
  bodyColor?: string;
  /**
   * Brighter variant of `bodyColor` used for bold spans in body contexts so
   * `**bold**` text pops slightly closer to white. Strong tokens nested
   * inside headings keep the heading colour instead — only spans whose base
   * style colour matches `bodyColor` get this override.
   */
  boldColor?: string;
  /**
   * Optional override for inline + fenced code spans. When set, code uses
   * this colour instead of the surrounding body colour. When undefined,
   * code inherits whichever colour is already in scope (body or heading).
   */
  codeColor?: string;
  /** Whether inline + fenced code adds the Ink `dimColor` flag. */
  codeDim?: boolean;
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

// Palette guideline: a theme's body text is monochromatic — bold, regular,
// inline code, and links all share `bodyColor`. The heading strip is the
// only multi-colour element. Heading colours are explicit truecolor hex
// values picked from the high-luminance band; combined with FORCE_COLOR=3
// at startup, they bypass the user's 256-colour palette and render at full
// brightness on dark backgrounds.

export const MARKDOWN_THEMES: MarkdownTheme[] = [
  {
    name: 'bright',
    label: 'Bright — multi-colour headings, neutral body',
    heading: {1: '#00FFFF', 2: '#00FF7F', 3: '#FFFF66', 4: '#FF66FF', 5: '#66B3FF', 6: '#FFFFFF'},
    bodyColor: '#ECECEC',
    boldColor: '#FFFFFF',
    // Subtle warm-grey wheat tint — same overall brightness band as a plain
    // gray, just shifted slightly toward yellow/red so code reads as a hint
    // distinct from the near-white body without being heavy-handed.
    codeColor: '#B0A488',
    codeDim: false,
    bulletColor: '#00FFFF',
    blockquoteBarColor: '#888888',
    blockquoteDim: true,
    dividerColor: '#FF66FF',
    tabActiveColor: '#00FFFF',
    tabReadyColor: '#E8E8E8',
    tabPendingColor: '#FFFF66',
    tabExtraColor: '#FF66FF',
  },
  {
    name: 'forest',
    label: 'Forest — green body, multi-hue headings',
    heading: {1: '#ADFF2F', 2: '#7FFF00', 3: '#FFD700', 4: '#FFB347', 5: '#DA70D6', 6: '#F5F5DC'},
    bodyColor: '#9CB59C',
    // Bold near white with a faint green tint toward h1.
    boldColor: '#F0FFE8',
    codeDim: true,
    bulletColor: '#7CFC00',
    blockquoteBarColor: '#556B2F',
    blockquoteDim: true,
    dividerColor: '#7FFFD4',
    tabActiveColor: '#7CFC00',
    tabReadyColor: '#A8E6A1',
    tabPendingColor: '#FFD700',
    tabExtraColor: '#DA70D6',
  },
  {
    name: 'sunset',
    label: 'Sunset — peach body, warm headings',
    heading: {1: '#FF8A80', 2: '#FFB347', 3: '#FFD966', 4: '#FF85C2', 5: '#DA70D6', 6: '#87CEEB'},
    bodyColor: '#B5A89C',
    // Bold near white with a warm peach hint.
    boldColor: '#FFF0E5',
    codeDim: true,
    bulletColor: '#FFB347',
    blockquoteBarColor: '#8B4513',
    blockquoteDim: true,
    dividerColor: '#FF6B6B',
    tabActiveColor: '#FFD700',
    tabReadyColor: '#FFD2B6',
    tabPendingColor: '#FF6B6B',
    tabExtraColor: '#FF69B4',
  },
  {
    name: 'ocean',
    label: 'Ocean — sky-blue body, cyan/coral headings',
    heading: {1: '#66B3FF', 2: '#5EE8EB', 3: '#7FFFD4', 4: '#FFA07A', 5: '#FFD966', 6: '#DA70D6'},
    bodyColor: '#9CACB5',
    // Bold near white with a faint blue tint.
    boldColor: '#EDF5FF',
    codeDim: true,
    bulletColor: '#00CED1',
    blockquoteBarColor: '#4682B4',
    blockquoteDim: true,
    dividerColor: '#1E90FF',
    tabActiveColor: '#00CED1',
    tabReadyColor: '#B6DCFF',
    tabPendingColor: '#FFD700',
    tabExtraColor: '#FF7F50',
  },
  {
    name: 'neon',
    label: 'Neon — pink body, neon headings',
    heading: {1: '#FF66B2', 2: '#00FFFF', 3: '#FFFF66', 4: '#DA70D6', 5: '#ADFF2F', 6: '#FFA94D'},
    bodyColor: '#B59CAC',
    // Bold near white with a faint pink tint.
    boldColor: '#FFE8F4',
    codeDim: true,
    bulletColor: '#FFFF66',
    blockquoteBarColor: '#9370DB',
    blockquoteDim: true,
    dividerColor: '#FF1493',
    tabActiveColor: '#00FFFF',
    tabReadyColor: '#FFB6E1',
    tabPendingColor: '#FF1493',
    tabExtraColor: '#7FFF00',
  },
  {
    name: 'autumn',
    label: 'Autumn — wheat body, warm headings',
    heading: {1: '#FF8A66', 2: '#FFA94D', 3: '#FFD966', 4: '#DA70D6', 5: '#98FB98', 6: '#DEB887'},
    bodyColor: '#B5A48A',
    // Bold near white with a faint wheat / salmon tint.
    boldColor: '#FFEDD8',
    codeDim: true,
    bulletColor: '#FFA94D',
    blockquoteBarColor: '#A0522D',
    blockquoteDim: true,
    dividerColor: '#FF6347',
    tabActiveColor: '#FFD700',
    tabReadyColor: '#F4A460',
    tabPendingColor: '#FF6347',
    tabExtraColor: '#DA70D6',
  },
  {
    name: 'candy',
    label: 'Candy — pink body, pop headings',
    heading: {1: '#FF85C2', 2: '#ADFF2F', 3: '#FFD966', 4: '#5EE8EB', 5: '#DA70D6', 6: '#FFA94D'},
    bodyColor: '#B59CAA',
    // Bold near white with a faint pink tint.
    boldColor: '#FFE8F0',
    codeDim: true,
    bulletColor: '#FF85C2',
    blockquoteBarColor: '#9370DB',
    blockquoteDim: true,
    dividerColor: '#FF69B4',
    tabActiveColor: '#7FFF00',
    tabReadyColor: '#FFB6D9',
    tabPendingColor: '#FFD700',
    tabExtraColor: '#5EE8EB',
  },
  {
    name: 'mono',
    label: 'Mono — black & white',
    heading: {1: '#FFFFFF', 2: '#F5F5F5', 3: '#E0E0E0', 4: '#CCCCCC', 5: '#B8B8B8', 6: '#A0A0A0'},
    bodyColor: undefined,
    boldColor: '#FFFFFF',
    codeDim: true,
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
