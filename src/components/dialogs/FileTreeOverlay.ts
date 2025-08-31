import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import {stringDisplayWidth, truncateDisplay, padEndDisplay} from '../../shared/utils/formatting.js';

const h = React.createElement;

type Props = {
  files: string[];
  highlightedFile: string;
  maxWidth: number;
  maxHeight: number;
  title?: string;
  overlayWidth?: number; // optional explicit width
  overlayHeight?: number; // optional explicit height
};

type TreeNode = {
  name: string;
  path: string; // full path for files; accumulated for dirs
  isDir: boolean;
  children?: Map<string, TreeNode>;
};

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = {name: '', path: '', isDir: true, children: new Map()};
  for (const file of files) {
    const parts = file.split('/').filter(Boolean);
    let node = root;
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!node.children) node.children = new Map();
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          path: currentPath,
          isDir: !isLast,
          children: !isLast ? new Map() : undefined
        });
      }
      node = node.children.get(part)!;
    }
  }
  return root;
}

type FlatRow = {label: string; path: string; depth: number; isDir: boolean};

function flattenTree(node: TreeNode): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (n: TreeNode, depth: number) => {
    if (n !== node) {
      const icon = n.isDir ? '📁 ' : '📄 ';
      rows.push({label: `${icon}${n.name}`, path: n.path, depth, isDir: n.isDir});
    }
    if (n.children && n.children.size > 0) {
      // Preserve insertion order to match underlying diff order
      for (const child of n.children.values()) walk(child, n === node ? 0 : depth + 1);
    }
  };
  walk(node, 0);
  return rows;
}

export default function FileTreeOverlay({files, highlightedFile, maxWidth, maxHeight, title = 'Files in Diff', overlayWidth, overlayHeight}: Props) {
  // Build and memoize tree representation
  const rows = useMemo(() => flattenTree(buildTree(files)), [files]);

  // Determine overlay dimensions
  // Leave some padding for border and title
  const innerPadding = 4; // borders (2) + paddingX:1 on both sides (2)
  const titleRowCount = 2; // title + help row
  const availableHeight = Math.max(5, maxHeight - 4);
  const boxHeight = overlayHeight ?? Math.min(availableHeight, Math.max(10, Math.floor(maxHeight * 0.6)));
  const contentHeight = Math.max(1, boxHeight - titleRowCount - 2); // minus border and title/help

  // Compute preferred width based on content (indent + label)
  const maxLabelWidth = rows.reduce((w, r) => Math.max(w, stringDisplayWidth('  '.repeat(r.depth) + r.label)), 0);
  const preferredWidth = overlayWidth ?? Math.min(maxWidth - 2, Math.max(30, maxLabelWidth + innerPadding));
  const innerWidth = Math.max(1, preferredWidth - innerPadding); // usable width for text in content area

  // Find highlighted index
  const highlightedIndex = useMemo(() => {
    const idx = rows.findIndex(r => !r.isDir && r.path === highlightedFile);
    // Fall back to first row
    return idx >= 0 ? idx : 0;
  }, [rows, highlightedFile]);

  // Auto-scroll to keep highlighted centered when possible
  const totalRows = rows.length;
  const startIndex = Math.max(0, Math.min(totalRows - contentHeight, highlightedIndex - Math.floor(contentHeight / 2)));
  const endIndex = Math.min(totalRows, startIndex + contentHeight);
  const visibleRows = rows.slice(startIndex, endIndex);

  return h(Box, {flexDirection: 'column', width: preferredWidth, height: boxHeight},
    h(Box, {flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', width: preferredWidth, height: boxHeight},
      // Title
      h(Box, {paddingX: 1}, h(Text, {bold: true, color: 'cyan'}, title)),
      // Divider (implicit spacing)
      h(Box, {flexDirection: 'column', flexGrow: 1, paddingX: 1},
        ...visibleRows.map((r, i) => {
          const isActive = startIndex + i === highlightedIndex;
          const prefix = '  '.repeat(r.depth);
          const raw = prefix + r.label;
          const clipped = truncateDisplay(raw, innerWidth);
          const padded = padEndDisplay(clipped, innerWidth);
          return h(Text, {
            key: `${r.path}-${i}`,
            backgroundColor: isActive ? 'blue' : undefined,
            bold: isActive,
            color: r.isDir ? 'white' : undefined
          }, padded);
        })
      ),
      h(Box, {paddingX: 1}, h(Text, {color: 'gray'}, 'Shift+←/→ to navigate files'))
    )
  );
}
