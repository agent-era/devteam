import {useTerminalDimensions} from './useTerminalDimensions.js';
import {calculatePageSize, calculatePaginationInfo} from '../utils/pagination.js';

interface PaginationState {
  pageSize: number;
  totalPages: number;
  currentPageStart: number;
  currentPageEnd: number;
  paginationText: string;
}

/**
 * Hook that provides pagination calculations based on current terminal dimensions
 */
export function usePagination(totalItems: number, currentPage: number): PaginationState {
  const {rows, columns} = useTerminalDimensions();
  
  const pageSize = calculatePageSize(rows, columns);
  const paginationInfo = calculatePaginationInfo(totalItems, currentPage, pageSize);
  
  return {
    pageSize,
    ...paginationInfo
  };
}

/**
 * Hook that provides just the dynamic page size based on terminal dimensions
 */
export function usePageSize(): number {
  const {rows, columns} = useTerminalDimensions();
  return calculatePageSize(rows, columns);
}