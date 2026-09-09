import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TortilleriaMapping } from './types';

/**
 * Store del mapping de la Tortillería en `voice_agents.features.tortilleria_mapping`.
 *
 * El mapping es estático por-agente (Nala): se genera con `scripts/upload-tortilleria-mapping.ts`
 * a partir del JSON consolidado y se actualiza cuando Beatriz agrega clientes/productos nuevos.
 * No cambia con cada correo entrante.
 */

const FEATURE_KEY = 'tortilleria_mapping';

/**
 * Carga el mapping guardado para un agente Nala. Devuelve null si no hay
 * mapping configurado — el pipeline degrada a escalar el bloque para revisión
 * humana en vez de emitir CFDIs sin códigos verificados.
 */
export async function getTortilleriaMapping(
  agentId: string,
  supabase: SupabaseClient = createAdminClient(),
): Promise<TortilleriaMapping | null> {
  const { data, error } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('id', agentId)
    .maybeSingle<{ features: Record<string, unknown> | null }>();

  if (error) throw new Error(`getTortilleriaMapping: ${error.message}`);
  if (!data?.features) return null;

  const raw = data.features[FEATURE_KEY] as TortilleriaMapping | undefined;
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.clients) || !Array.isArray(raw.products)) return null;

  return raw;
}

/**
 * Persiste el mapping. Idempotente: sobreescribe la key completa.
 * Usado por el script de upload (no por el pipeline en runtime).
 */
export async function saveTortilleriaMapping(
  agentId: string,
  mapping: TortilleriaMapping,
  supabase: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { data: agent, error: readErr } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('id', agentId)
    .maybeSingle<{ features: Record<string, unknown> | null }>();
  if (readErr) throw new Error(`saveTortilleriaMapping (read): ${readErr.message}`);

  const features = { ...(agent?.features ?? {}), [FEATURE_KEY]: mapping };
  const { error } = await supabase
    .from('voice_agents')
    .update({ features })
    .eq('id', agentId);
  if (error) throw new Error(`saveTortilleriaMapping (update): ${error.message}`);
}
