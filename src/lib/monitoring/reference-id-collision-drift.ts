// Drift detector para colisiones de reference_id en ops_ledger.
//
// Contexto del bug (hallazgo investigación 2026-10-01):
// El UNIQUE constraint `ops_ledger_portal_ref_kind_uniq` sobre
// (portal_email, reference_id, kind) protege contra doble cobro cuando dos
// `consumeAiOp` llegan con el mismo reference_id. Pero si dos sources
// LEGÍTIMAMENTE DISTINTOS (ej. incident_registered + incidencia_notif) usan
// el mismo reference_id (incidentId pelado), el constraint rechaza el 2do
// cobro silenciosamente. Resultado: undercharge sistemático que no explota
// ningún error visible al cliente.
//
// Cuando el RPC `consume_pool_ops` falla por constraint, `consumeAiOp`
// escribe una fila en `ai_ops_log` con `count=0` y `context` conteniendo
// `rpc_error` con el mensaje "duplicate key value violates unique
// constraint". Este detector cuenta esas filas en las últimas 24h.
//
// Patrón de fix recomendado cuando hay alerta:
//   - Identificar los 2 sources que colisionan (buscar en ai_ops_log el mismo
//     reference_id con count=0).
//   - Cambiar el reference_id del cobro secundario a `${baseRef}:<sufijo>`.
//   - Ver registrar-incidencia.ts para el patrón canónico.

import type { SupabaseClient } from '@supabase/supabase-js';

// Umbral: cualquier ocurrencia en 24h ya es señal. Este bug no debe aparecer
// nunca en operación normal — si aparece, alguien agregó un cobro nuevo que
// comparte reference_id con otro cobro del mismo portal/kind.
export const REF_COLLISION_WINDOW_HOURS = 24;
export const REF_COLLISION_WARN_THRESHOLD = 1;

export interface ReferenceIdCollisionRow {
  portal_email: string;
  source:       string;
  count:        number;      // número de rows afectadas en la ventana
  sample_refs:  string[];    // hasta 3 reference_ids de ejemplo
}

export interface ReferenceIdCollisionResult {
  level: 'ok' | 'warn' | 'critical';
  total: number;
  byOrg: ReferenceIdCollisionRow[];
}

/**
 * Query ai_ops_log por rows con count=0 que incluyan en context el string
 * "duplicate key" (señal del UNIQUE constraint fallando). Agrupa por
 * portal_email + source. Devuelve lista ordenada por cantidad descendente.
 *
 * Pure-ish: solo lee de Supabase, no envía notificaciones.
 */
export async function detectReferenceIdCollisions(
  supabase: SupabaseClient,
  nowMs: number = Date.now(),
  windowHours: number = REF_COLLISION_WINDOW_HOURS,
): Promise<ReferenceIdCollisionResult> {
  const since = new Date(nowMs - windowHours * 3_600_000).toISOString();

  const { data } = await supabase
    .from('ai_ops_log')
    .select('portal_email, source, reference_id, context, created_at')
    .eq('count', 0)
    .gte('created_at', since)
    .ilike('context', '%duplicate key%')
    .limit(500);

  const rows = data ?? [];

  const grouped = new Map<string, ReferenceIdCollisionRow>();
  for (const r of rows) {
    const key = `${r.portal_email}|${r.source}`;
    const prev = grouped.get(key);
    if (prev) {
      prev.count += 1;
      if (prev.sample_refs.length < 3 && r.reference_id && !prev.sample_refs.includes(r.reference_id)) {
        prev.sample_refs.push(r.reference_id);
      }
    } else {
      grouped.set(key, {
        portal_email: r.portal_email ?? 'unknown',
        source:       r.source ?? 'unknown',
        count:        1,
        sample_refs:  r.reference_id ? [r.reference_id] : [],
      });
    }
  }

  const byOrg = Array.from(grouped.values()).sort((a, b) => b.count - a.count);
  const total = byOrg.reduce((s, g) => s + g.count, 0);

  let level: 'ok' | 'warn' | 'critical' = 'ok';
  if (total >= REF_COLLISION_WARN_THRESHOLD) level = 'warn';
  if (total >= REF_COLLISION_WARN_THRESHOLD * 10) level = 'critical';

  return { level, total, byOrg };
}
