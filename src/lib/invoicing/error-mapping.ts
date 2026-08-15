export type SfErrorAction = 'ok' | 'silent' | 'notify_org' | 'notify_platform';
export interface SfErrorInfo { retryable: boolean; action: SfErrorAction; }

export function mapSfError(code: number): SfErrorInfo {
  if (code === 200) return { retryable: false, action: 'ok' };
  // XML / sello inválido — bug del builder o CSD corrupto
  if (code === 301 || code === 302) return { retryable: false, action: 'notify_platform' };
  // Server errors — retryable
  if (code === 500 || code === 501 || code === 503) return { retryable: true, action: 'silent' };
  // Auth / cuenta — credenciales rotas, avisar org
  if (code >= 601 && code <= 605) return { retryable: false, action: 'notify_org' };
  // Timbres agotados — org debe comprar más al PAC
  if (code >= 630 && code <= 632) return { retryable: false, action: 'notify_org' };
  // Desconocido: por seguridad no reintenta, notifica plataforma para investigar
  return { retryable: false, action: 'notify_platform' };
}
