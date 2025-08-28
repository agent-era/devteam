/**
 * Calculate optimal page size based on terminal dimensions and UI requirements
 */
export function calculatePageSize(
  terminalRows = process.stdout.rows || 24,
  terminalCols = process.stdout.columns || 80
): number {
  // Compact header text using single-letter shortcuts (52 chars)
  const headerText = 'Enter attach, n new, a archive, x exec, d diff, s shell, q quit';
  
  // Calculate how many lines the header will take
  const estimatedHeaderLines = Math.ceil(headerText.length / terminalCols);
  
  // Calculate reserved lines more accurately
  let reservedLines;
  if (terminalRows <= 8) {
    // Very short terminal - minimal UI overhead
    // Header + column header + minimal margin
    reservedLines = Math.min(estimatedHeaderLines + 2, terminalRows - 1); // At least 1 row for content
  } else {
    // Normal terminal - full UI
    // Reserve space for UI elements:
    // - Header: estimatedHeaderLines (usually 1 with 63 char header)
    // - Header margin: 1 line (marginBottom: 1)
    // - Column header: 1 line  
    // - Footer (pagination): 1 line when multiple pages exist
    // - Footer margin: 1 line (marginTop: 1 when footer exists)
    reservedLines = estimatedHeaderLines + 4; // Account for all margins and footer
  }
  
  // Calculate available space for worktree rows
  const availableRows = terminalRows - reservedLines;
  
  // Ensure minimum of 1 item per page
  return Math.max(1, availableRows);
}

/**
 * Calculate pagination info for display
 */
export function calculatePaginationInfo(
  totalItems: number, 
  currentPage: number, 
  pageSize: number
): {
  totalPages: number;
  currentPageStart: number;
  currentPageEnd: number;
  paginationText: string;
} {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  
  if (totalPages <= 1) {
    return {
      totalPages: 1,
      currentPageStart: 1,
      currentPageEnd: totalItems,
      paginationText: `  [${totalItems} items]`
    };
  }
  
  const currentPageStart = currentPage * pageSize + 1;
  const currentPageEnd = Math.min((currentPage + 1) * pageSize, totalItems);
  const paginationText = `  [Page ${currentPage + 1}/${totalPages}: ${currentPageStart}-${currentPageEnd}/${totalItems}]`;
  
  return {
    totalPages,
    currentPageStart,
    currentPageEnd,
    paginationText
  };
}