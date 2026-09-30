import { parse, wcagLuminance } from "culori";

/**
 * Calculates WCAG 2.1 contrast ratio between two colors (range 1:1 to 21:1).
 */
export function getContrastRatio(colorA: string, colorB: string): number {
  const cA = parse(colorA);
  const cB = parse(colorB);
  if (!cA || !cB) return 1;

  const lumA = wcagLuminance(cA);
  const lumB = wcagLuminance(cB);

  const l1 = Math.max(lumA, lumB);
  const l2 = Math.min(lumA, lumB);

  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Verifies if contrast ratio meets WCAG AA standard:
 * - 4.5:1 for normal text
 * - 3.0:1 for large text / UI borders / muted elements
 */
export function meetsWcagAA(foreground: string, background: string, largeText = false): boolean {
  const ratio = getContrastRatio(foreground, background);
  return ratio >= (largeText ? 3.0 : 4.5);
}
