/**
 * Monitor de truncación por max_tokens en voice_llm.
 *
 * Contexto (2026-09-28): Nia Santiago con Sonnet 5.5 agotaba max_tokens en
 * cada turno porque el "adaptive thinking" always-on de Sonnet 5.5 consume
 * tokens del budget. Sintoma para el llamante: "problema de conexion".
 * Fix inmediato: effort=low + thinking=between_tools + max_tokens=2000.
 * Este monitor detecta regresiones similares en cualquier agente/rol.
 *
 * Umbrales:
 *   - WARN:     ratio de stop_reason=max_tokens ≥ 2% (amarillo)
 *   - CRITICAL: ratio ≥ 5% (rojo) — el modelo se queda sin espacio
 *     consistentemente y responde truncado, cliente escucha vacio.
 *
 * Ventanas:
 *   - 1h: usada por infra-alerts para detectar regresion inmediata
 *   - 24h: usada por admin/versiones?tab=health para diagnostico
 */

import type { createAdminClient } from '@/lib/supabase/admin';

export const MAX_TOKENS_WARN_RATIO     = 0.02;  // 2%
export const MAX_TOKENS_CRITICAL_RATIO = 0.05;  // 5%
export const MIN_SAMPLE_SIZE           = 10;    // no evaluar debajo de esto (ruido)

export interface TruncationStats {
  role:                string | null;
  model:               string;
  total_turns:         number;
  max_tokens_turns:    number;
  ratio:               number;
  level:               'ok' | 'warn' | 'critical';
  window_minutes:      number;
}

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Calcula ratio de stop_reason=max_tokens por (rol, modelo) en una ventana.
 * Cruza llm_call_log con voice_agents para resolver el meerkat_role_id.
 * Agrupa por (rol, modelo) porque un mismo rol puede tener varias versiones
 * en activo (canario/estable) y quremos verlos por separado.
 */
export async function getMaxTokensTruncationStats(
  supabase:      SupabaseClient,
  windowMinutes: number,
): Promise<TruncationStats[]> {
  const sinceISO = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  // llm_call_log meta.stop_reason vive dentro del jsonb `meta`. Traemos las
  // filas recientes de voice_llm y agregamos en memoria (volumen tipico de
  // Centinelia < 10K turnos/dia, sobra).
  const { data, error } = await supabase
    .from('llm_call_log')
    .select('agent_id, model, meta')
    .eq('source', 'voice_llm')
    .gte('created_at', sinceISO);
  if (error) throw error;
  if (!data?.length) return [];

  // Resolver agent_id -> meerkat_role_id via voice_agents.
  const agentIds = Array.from(new Set(data.map(r => r.agent_id as string | null).filter((x): x is string => !!x)));
  const roleByAgent = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from('voice_agents')
      .select('id, features')
      .in('id', agentIds);
    for (const a of agents ?? []) {
      const role = ((a.features ?? {}) as Record<string, unknown>).meerkat_role_id as string | undefined;
      if (role) roleByAgent.set(a.id as string, role);
    }
  }

  // Agrupar por (rol, modelo)
  interface Bucket { total: number; truncated: number }
  const buckets = new Map<string, Bucket>();
  for (const row of data) {
    const role  = row.agent_id ? (roleByAgent.get(row.agent_id as string) ?? '(sin rol)') : '(sin agent_id)';
    const model = (row.model as string | null) ?? '(sin model)';
    const key   = `${role}||${model}`;
    const stop  = ((row.meta ?? {}) as Record<string, unknown>).stop_reason as string | undefined;
    const b     = buckets.get(key) ?? { total: 0, truncated: 0 };
    b.total++;
    if (stop === 'max_tokens') b.truncated++;
    buckets.set(key, b);
  }

  const results: TruncationStats[] = [];
  for (const [key, b] of buckets) {
    const [role, model] = key.split('||');
    const ratio = b.total > 0 ? b.truncated / b.total : 0;
    let level: TruncationStats['level'] = 'ok';
    if (b.total >= MIN_SAMPLE_SIZE) {
      if (ratio >= MAX_TOKENS_CRITICAL_RATIO) level = 'critical';
      else if (ratio >= MAX_TOKENS_WARN_RATIO) level = 'warn';
    }
    results.push({
      role:             role === '(sin rol)' || role === '(sin agent_id)' ? null : role,
      model,
      total_turns:      b.total,
      max_tokens_turns: b.truncated,
      ratio,
      level,
      window_minutes:   windowMinutes,
    });
  }

  // Orden: critical primero, luego warn, luego ok
  results.sort((a, b) => {
    const lvl = { critical: 0, warn: 1, ok: 2 };
    if (lvl[a.level] !== lvl[b.level]) return lvl[a.level] - lvl[b.level];
    return b.ratio - a.ratio;
  });

  return results;
}

/** Filas que ameritan alerta (warn o critical). */
export function pickAlerts(stats: TruncationStats[]): TruncationStats[] {
  return stats.filter(s => s.level !== 'ok');
}
