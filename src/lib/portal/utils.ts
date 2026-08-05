/** Returns a color based on consumption percentage (green → amber → red). */
export function uColor(pct: number): string {
  return pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
}

/** Returns a CSS variable string based on consumption percentage (green → amber → red).
 *  Mirrors uColor thresholds but uses design-token vars instead of hardcoded hex. */
export function uColorVar(pct: number): string {
  return pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--success)';
}
