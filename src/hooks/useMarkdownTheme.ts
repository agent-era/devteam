import React from 'react';
import {getActiveMarkdownTheme, subscribeMarkdownTheme, type MarkdownTheme} from '../shared/utils/markdown/themes.js';

/**
 * Subscribe to the active markdown theme. Returns the live theme object;
 * the component re-renders whenever the theme is cycled.
 */
export function useMarkdownTheme(): MarkdownTheme {
  const [theme, setTheme] = React.useState<MarkdownTheme>(getActiveMarkdownTheme);
  React.useEffect(() => subscribeMarkdownTheme(() => setTheme(getActiveMarkdownTheme())), []);
  return theme;
}
