// Facturama devuelve códigos HTTP + payload de error tipo:
//   { Message: "...", ModelState: { "campo": ["descripción error"] } }
// Retryable: 429 (rate limit), 502/503/504 (infra). El resto son de validación.
export function mapFacturamaError(status: number): { retryable: boolean } {
  if (status === 429) return { retryable: true };
  if (status >= 500 && status < 600) return { retryable: true };
  return { retryable: false };
}

export function extractErrorMessage(json: unknown, raw: string): string {
  const r = (json ?? {}) as Record<string, unknown>;
  const msg = r.Message ?? r.message ?? '';
  const modelState = r.ModelState as Record<string, unknown> | undefined;
  if (modelState && typeof modelState === 'object') {
    const details = Object.entries(modelState)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join(' | ');
    return details ? `${msg}${msg ? ' — ' : ''}${details}` : String(msg || raw.slice(0, 300));
  }
  return String(msg || raw.slice(0, 300));
}
