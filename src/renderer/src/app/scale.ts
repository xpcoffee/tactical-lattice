/** Returns a CSS calc() expression that scales a reference-pixel value
 *  proportionally to the viewport via the --s custom property.
 *  At 1280×800, var(--s) = 1 so s(16) = 16px. At larger sizes it scales up. */
export function s(px: number): string {
  return `calc(${px} * var(--s))`
}
