import { createHash } from 'crypto';
import type { ReglasNegocio } from './types';

/**
 * Construye un hash SHA-256 de idempotencia para un envio de trámite.
 *
 * La cadena canónica tiene el formato:
 *   tramite_id|YYYYMMDD|k1=v1|k2=v2|...
 *
 * Las claves se ordenan alfabéticamente. Si `reglas.idempotency_fields` está
 * definido, solo se usan esas claves; de lo contrario se usan todas las del
 * mapa `campos`.
 */
export function buildIdempotencyHash(
  tramiteId: string,
  campos:    Record<string, unknown>,
  reglas:    ReglasNegocio,
): string {
  const today = new Date();
  const yyyy  = today.getUTCFullYear().toString();
  const mm    = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd    = String(today.getUTCDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const keys = reglas.idempotency_fields?.length
    ? [...reglas.idempotency_fields].sort()
    : Object.keys(campos).sort();

  const pairs = keys.map(k => `${k}=${String(campos[k] ?? '')}`).join('|');
  const canonical = `${tramiteId}|${dateStr}|${pairs}`;

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
