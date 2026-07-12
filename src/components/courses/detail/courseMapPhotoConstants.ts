/** 지도 패널 높이 — 기존 값 × 1.15 */
export const MAP_PANEL_HEIGHT = {
  base: Math.round(230 * 1.15), // 265
  sm: Math.round(255 * 1.15), // 293
  lg: Math.round(300 * 1.15), // 345
} as const;

/** 데스크톱 사진 갤러리 = 지도 패널과 동일 높이 */
export const GALLERY_HEIGHT_LG = MAP_PANEL_HEIGHT.lg;
