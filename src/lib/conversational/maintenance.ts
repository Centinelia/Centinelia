/**
 * Mantenimiento del catálogo de aprendizajes conversacionales.
 * Se corre por cron (weekly) para evitar prompt bloat.
 *
 * Reglas:
 *   1. Cap duro: MAX_ACTIVE aprendizajes 'active' totales. LRU por (source_count DESC, approved_at DESC).
 *   2. Auto-retiro por edad: age > MAX_AGE_DAYS && source_count < MIN_USAGE -> 'archived'.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export const MAX_ACTIVE      = 20;
export const MAX_AGE_DAYS    = 180;
export const MIN_USAGE       = 3;

export interface MaintenanceSummary {
  archivedByAge:  number;
  archivedByCap:  number;
  keptActive:     number;
  ranAt:          string;
}

export async function runConversationalMaintenance(): Promise<MaintenanceSummary> {
  const supabase = createAdminClient();
  const now      = new Date();
  const cutoff   = new Date(now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 1) Auto-archivo por edad + poco uso
  const { data: staleRows } = await supabase
    .from('conversational_learnings')
    .select('id')
    .eq('status', 'active')
    .lt('approved_at', cutoff)
    .lt('source_count', MIN_USAGE);

  const staleIds = (staleRows ?? []).map(r => r.id as string);
  if (staleIds.length) {
    await supabase
      .from('conversational_learnings')
      .update({ status: 'archived' })
      .in('id', staleIds);
  }

  // 2) Cap duro: si aún hay más de MAX_ACTIVE activos, archivar los peores
  const { data: activeRows } = await supabase
    .from('conversational_learnings')
    .select('id, source_count, approved_at')
    .eq('status', 'active');

  const excess = (activeRows ?? [])
    .sort((a, b) => {
      // Ordenar por (source_count DESC, approved_at DESC). Los peores al final.
      const scDiff = (b.source_count as number) - (a.source_count as number);
      if (scDiff !== 0) return scDiff;
      const bAt = b.approved_at ? new Date(b.approved_at as string).getTime() : 0;
      const aAt = a.approved_at ? new Date(a.approved_at as string).getTime() : 0;
      return bAt - aAt;
    })
    .slice(MAX_ACTIVE);

  const excessIds = excess.map(r => r.id as string);
  if (excessIds.length) {
    await supabase
      .from('conversational_learnings')
      .update({ status: 'archived' })
      .in('id', excessIds);
  }

  return {
    archivedByAge: staleIds.length,
    archivedByCap: excessIds.length,
    keptActive:    Math.min(activeRows?.length ?? 0, MAX_ACTIVE) - staleIds.length,
    ranAt:         now.toISOString(),
  };
}
