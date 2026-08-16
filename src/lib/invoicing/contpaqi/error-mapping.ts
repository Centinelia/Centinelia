// Error mapping para CONTPAQi Timbra v3 (SCAFFOLD).
//
// Códigos reales pendientes de confirmar contra la doc del portal
// developers.contpaqinube.com. Estos son los códigos comunes de PACs
// mexicanos + los de Azure APIM (401/429/5xx). Ajustar cuando tengamos
// el listado oficial de CONTPAQi.

export type ContpaqiErrorAction = 'ok' | 'silent' | 'notify_org' | 'notify_platform';
export interface ContpaqiErrorInfo { retryable: boolean; action: ContpaqiErrorAction; }

export function mapContpaqiError(code: number): ContpaqiErrorInfo {
  if (code === 200) return { retryable: false, action: 'ok' };
  // Auth / suscripción — creds rotas o subscription key inválida
  if (code === 401 || code === 403) return { retryable: false, action: 'notify_org' };
  // Rate limit Azure APIM
  if (code === 429) return { retryable: true, action: 'silent' };
  // Server errors upstream — retryable
  if (code >= 500 && code < 600) return { retryable: true, action: 'silent' };
  // Validación CFDI (400 típico) — bug del builder o data inválida
  if (code === 400 || code === 422) return { retryable: false, action: 'notify_platform' };
  // Códigos SAT que CONTPAQi pasa a través (301/302 en su rango custom)
  if (code === 301 || code === 302) return { retryable: false, action: 'notify_platform' };
  // Sin timbres en la cuenta CONTPAQi
  if (code === 402 || code === 630) return { retryable: false, action: 'notify_org' };
  return { retryable: false, action: 'notify_platform' };
}
