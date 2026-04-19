import {calculateMainViewPageSize} from '../shared/utils/layout.js';

/**
 * Calculate optimal page size based on terminal dimensions and UI requirements
 */
export function calculatePageSize(
  terminalRows = process.stdout.rows || 24,
  terminalCols = process.stdout.columns || 80
): number {
  return Math.min(100, calculateMainViewPageSize(terminalRows, terminalCols));
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
