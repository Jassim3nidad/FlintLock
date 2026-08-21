/** WCAG 2.x relative luminance and contrast ratio — used to verify token pairs, not just eyeballed. */

function srgbChannelToLinear(value: number): number {
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return (
    0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b)
  );
}

/** WCAG contrast ratio between two colors, in [1, 21]. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.x AA thresholds. */
export const WCAG_AA_NORMAL_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT = 3.0;
/** Non-text UI component boundaries that need to be operable (input borders, focus rings) — 1.4.11. */
export const WCAG_AA_UI_COMPONENT = 3.0;

export function meetsWcagAA(hexA: string, hexB: string, threshold: number): boolean {
  return contrastRatio(hexA, hexB) >= threshold;
}
