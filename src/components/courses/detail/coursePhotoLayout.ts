/** Keep the existing lower-row breakpoints; upper cells reuse this full-width size. */
export function memberPhotoColumns(contentWidth: number): number {
  return contentWidth >= 1000 ? 10 : contentWidth >= 800 ? 8 : contentWidth >= 560 ? 6 : 4;
}

export function memberPhotoCellSize(contentWidth: number, gap = 6): number {
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return 0;
  return Math.max(0, (contentWidth - gap * (memberPhotoColumns(contentWidth) - 1)) / memberPhotoColumns(contentWidth));
}

export function fittingPhotoCount(availableWidth: number, cellSize: number, gap: number): number {
  if (![availableWidth, cellSize, gap].every(Number.isFinite) || availableWidth <= 0 || cellSize <= 0 || gap < 0) return 0;
  return Math.max(0, Math.floor((availableWidth + gap) / (cellSize + gap)));
}
