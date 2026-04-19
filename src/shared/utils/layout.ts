export function clampRowBudget(rows: number): number {
  return Math.max(1, Math.floor(rows));
}

export function calculateMainViewPageSize(
  terminalRows: number,
  terminalCols: number,
  options?: {
    hasMemoryWarning?: boolean;
    hasUpdateBanner?: boolean;
  }
): number {
  const basePageSize = calculateBasePageSize(terminalRows, terminalCols);
  let reservedAdjustment = 0;

  if (options?.hasMemoryWarning) {
    reservedAdjustment += 2;
  }

  if (options?.hasUpdateBanner) {
    reservedAdjustment += 2;
  }

  return clampRowBudget(basePageSize - reservedAdjustment);
}

export function calculateDiffViewportRows(
  terminalRows: number,
  options?: {
    hasFileHeader?: boolean;
    hasHunkHeader?: boolean;
    showCommentSummary?: boolean;
    overlayHeight?: number;
  }
): number {
  let reservedRows = 2;

  if (options?.hasFileHeader) {
    reservedRows += 1;
  }

  if (options?.hasHunkHeader) {
    reservedRows += 1;
  }

  if (options?.showCommentSummary) {
    reservedRows += 1;
  }

  if (options?.overlayHeight && options.overlayHeight > 0) {
    reservedRows += options.overlayHeight;
  }

  return clampRowBudget(terminalRows - reservedRows);
}

function calculateBasePageSize(terminalRows: number, terminalCols: number): number {
  const rows = Number.isFinite(terminalRows) && terminalRows > 0 ? terminalRows : 24;
  const cols = Number.isFinite(terminalCols) && terminalCols > 0 ? terminalCols : 80;
  const headerText = 'Enter/a agent, n new, v archive, x exec, d diff, s shell, q quit';
  const estimatedHeaderLines = Math.ceil(headerText.length / cols);

  let reservedLines: number;
  if (rows <= 8) {
    reservedLines = Math.min(estimatedHeaderLines + 2, rows - 1);
  } else {
    reservedLines = estimatedHeaderLines + 4;
  }

  return clampRowBudget(rows - reservedLines);
}
