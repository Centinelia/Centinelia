/** Returns a color based on consumption percentage (green → amber → red). */
export function uColor(pct: number): string {
  return pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
}
