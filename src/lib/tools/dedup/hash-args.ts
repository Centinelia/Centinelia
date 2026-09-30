import { createHash } from 'node:crypto';

const IDENTITY_KEYS = /^(contact_phone|phone|telefono|contact_email|email|correo|business_name|negocio|contact_name|nombre|sucursal|cliente_id|.*_id)$/i;
const DETAIL_KEYS   = /^(motivo|notas|detalles|descripcion|mensaje|texto|transcript|resumen|observaciones|razon|contexto)$/i;
const TIME_KEYS     = /^(fecha|hora|created_at|scheduled_at|.*_at|.*_time)$/i;
const FREE_TEXT_MAX_LEN = 200;

function normalize(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  return v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function sortDeep(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(sortDeep);
  if (typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    out[k] = sortDeep((v as Record<string, unknown>)[k]);
  }
  return out;
}

function keepKey(k: string, v: unknown): boolean {
  if (DETAIL_KEYS.test(k) || TIME_KEYS.test(k)) return false;
  if (typeof v === 'string' && v.length > FREE_TEXT_MAX_LEN) return false;
  return true;
}

function pickKept(
  args: Record<string, unknown>,
  override?: { identity_keys?: string[]; detail_keys?: string[] },
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  const explicitId     = new Set(override?.identity_keys ?? []);
  const explicitDetail = new Set(override?.detail_keys ?? []);
  for (const [k, v] of Object.entries(args)) {
    if (explicitId.has(k))     { kept[k] = normalize(v); continue; }
    if (explicitDetail.has(k)) { continue; }
    if (!keepKey(k, v))        { continue; }
    if (IDENTITY_KEYS.test(k)) { kept[k] = normalize(v); }
    else                       { kept[k] = v; }
  }
  return kept;
}

export function computeArgsHash(
  toolName: string,
  args: Record<string, unknown>,
  override?: { identity_keys?: string[]; detail_keys?: string[] },
): string {
  const kept = pickKept(args, override);
  const canonical = JSON.stringify(sortDeep(kept));
  return createHash('sha256').update(`${toolName}::${canonical}`).digest('hex');
}
