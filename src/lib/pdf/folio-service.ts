/**
 * Folio service — genera folios monotónicos por (portal_email, prefix).
 *
 * Reemplaza al helper `folio()` de pdf/doc.tsx que devolvía random 1000-9999.
 * Este es atómico: UPSERT + RETURNING garantiza concurrencia sin locks explícitos.
 *
 * Uso típico:
 *   const folio = await nextFolio('COT', portalEmail, supabase);
 *   // → "COT-000042"
 *   // Luego pasar a CotizacionPdf via `folioNum` prop y guardar en
 *   // ops_documents.folio para que buscar_documento_oficina lo encuentre.
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

const FOLIO_PAD = 6;

/**
 * Devuelve el siguiente folio para un (portal_email, prefix). Atómico.
 * Formato: `{PREFIX}-{NNNNNN}`.
 *
 * Si falla la escritura en DB (permisos, tabla no existe), devuelve un folio
 * fallback con timestamp para no bloquear la generación del documento. Se
 * registra el error en console para investigación.
 */
export async function nextFolio(
  prefix:      string,
  portalEmail: string,
  supabase:    SupabaseClient,
): Promise<string> {
  const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleanPrefix) throw new Error('nextFolio: prefix vacío');

  // Postgres UPSERT + RETURNING atómico. Si la row existe, incrementa; si no,
  // inserta con next_number=1. Retornamos el nuevo next_number, que ES el
  // folio a asignar para ESTE documento.
  const { data, error } = await (supabase as any).rpc('next_folio', {
    p_portal_email: portalEmail,
    p_prefix:       cleanPrefix,
  });

  if (error || typeof data !== 'number') {
    console.error('[folio-service] RPC falló, intentando UPSERT directo:', error);
    // Fallback: intentar UPSERT directo sin RPC (menos atómico pero funcional).
    const upsertResult = await upsertFolio(cleanPrefix, portalEmail, supabase);
    if (upsertResult !== null) return format(cleanPrefix, upsertResult);
    // Último fallback: timestamp para no bloquear al usuario.
    console.error('[folio-service] Fallback timestamp folio para', portalEmail, cleanPrefix);
    return `${cleanPrefix}-${Date.now().toString().slice(-6)}`;
  }

  return format(cleanPrefix, data);
}

function format(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(FOLIO_PAD, '0')}`;
}

/**
 * Fallback si el RPC `next_folio` no está creado en la DB. Usa SELECT + UPDATE
 * simulando incremento. NO es atómico bajo alta concurrencia — 2 llamadas
 * simultáneas podrían leer el mismo next_number. Aceptable como fallback
 * mientras el RPC no está disponible.
 */
async function upsertFolio(prefix: string, portalEmail: string, supabase: SupabaseClient): Promise<number | null> {
  const { data: existing } = await (supabase as any)
    .from('document_folios')
    .select('next_number')
    .eq('portal_email', portalEmail)
    .eq('prefix', prefix)
    .maybeSingle();

  if (existing) {
    const next = ((existing as { next_number: number }).next_number ?? 1) + 1;
    const { error } = await (supabase as any)
      .from('document_folios')
      .update({ next_number: next, updated_at: new Date().toISOString() })
      .eq('portal_email', portalEmail)
      .eq('prefix', prefix);
    if (error) return null;
    return existing.next_number;
  }

  // Primera vez para este (portal_email, prefix)
  const { error } = await (supabase as any)
    .from('document_folios')
    .insert({ portal_email: portalEmail, prefix, next_number: 2 });
  if (error) return null;
  return 1;
}
