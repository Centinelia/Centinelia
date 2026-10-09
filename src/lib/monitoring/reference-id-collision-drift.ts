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
 * 2026-10-09 (segunda vuelta): descarta "same-source retries". El UNIQUE
 * constraint sobre (portal_email, reference_id, kind) también rechaza
 * cuando el MISMO source re-llama consumeAiOp (orphan recovery, dedup
 * fallback, retry externo). En ese caso el primer intento cobró OK (fila
 * count>0 en ai_ops_log con el mismo source y ref), y el 2do intento
 * es idempotencia correcta, NO undercharge. Caso real que motivó este
 * guard: Camila/AC Proyectos 2026-10-09, 15 rechazos del inbox_processor
 * sobre 12 correos únicos, cada uno con su cobro exitoso en ops_ledger.
 * Ver [[feedback-fixes-para-siempre]].
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

  // Para cada reject necesitamos saber si existe un cobro exitoso (count>0)
  // en la misma ventana para el mismo reference_id. Si existe Y es del mismo
  // source, es idempotencia (same-source retry) → descartar.
  const refs = Array.from(new Set(rows.map(r => r.reference_id).filter(Boolean))) as string[];
  const sameSourceCharged = new Set<string>(); // `${portal_email}|${source}|${reference_id}`
  if (refs.length > 0) {
    const { data: siblings } = await supabase
      .from('ai_ops_log')
      .select('portal_email, source, reference_id, count, created_at')
      .in('reference_id', refs)
      .gte('created_at', since)
      .limit(500);
    for (const s of siblings ?? []) {
      if ((s.count ?? 0) > 0 && s.reference_id) {
        sameSourceCharged.add(`${s.portal_email}|${s.source}|${s.reference_id}`);
      }
    }
  }

  const grouped = new Map<string, ReferenceIdCollisionRow>();
  for (const r of rows) {
    // Skip idempotent same-source retries: ya existe un cobro exitoso
    // del mismo (portal, source, ref). El UNIQUE constraint hizo su trabajo.
    const idempotencyKey = `${r.portal_email}|${r.source}|${r.reference_id}`;
    if (r.reference_id && sameSourceCharged.has(idempotencyKey)) continue;

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
