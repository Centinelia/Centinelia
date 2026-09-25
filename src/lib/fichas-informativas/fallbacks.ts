/**
 * Fallbacks de recuperación para fichas informativas cuando el path principal
 * (embedding semántico + RPC pgvector) falla.
 *
 * Cadena de fallback:
 *   1. tsvectorFallback  — Postgres full-text search en español sobre chunks.
 *   2. updatedAtFallback — Fichas más recientes del org (least-worst effort).
 *   3. Si ambos fallan   — array vacío + warning log.
 *
 * Cada fallback emite warning log con logger.warn para tracking operacional.
 * No cobra ops adicionales — el cobro del 1 op runtime va en el path principal.
 *
 * Ver: docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md Sección 6.4
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface FallbackFichaChunk {
  id:       string;
  content:  string;
  titulo?:  string;
  ficha_id: string;
}

// ─── tsvectorFallback ────────────────────────────────────────────────────────

/**
 * Full-text search sobre fichas_informativas_chunks usando tsvector de Postgres.
 * Usa el diccionario 'spanish' y plainto_tsquery para aceptar frases naturales.
 * Ordena por ts_rank descendente (via RPC tsvector_search_fichas_chunks).
 *
 * Usamos RPC en lugar del .textSearch() del SDK Supabase JS porque ese método
 * no expone ordering por ts_rank, devolviendo resultados en orden arbitrario.
 * El RPC aplica ORDER BY ts_rank DESC internamente.
 *
 * Activado cuando: embedText() falla (OpenAI down, timeout, cuota).
 */
export async function tsvectorFallback(
  portalEmail: string,
  query: string,
  limit: number = 15,
): Promise<FallbackFichaChunk[]> {
  if (!query.trim()) return [];

  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase.rpc('tsvector_search_fichas_chunks', {
      p_portal_email: portalEmail,
      p_query:        query,
      p_limit:        limit,
    });

    if (error) {
      console.warn('[retrieval] tsvector_fallback query error:', { query, error: error.message });
      return [];
    }

    return (data ?? []).map((row: { id: string; content: string; ficha_id: string; titulo?: string }) => ({
      id:       row.id,
      content:  row.content,
      ficha_id: row.ficha_id,
      titulo:   row.titulo ?? undefined,
    }));
  } catch (err) {
    console.warn('[retrieval] tsvector_fallback exception:', { query, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ─── updatedAtFallback ───────────────────────────────────────────────────────

/**
 * Devuelve las fichas más recientes del org ordenadas por updated_at DESC.
 * Representa el "least-worst" effort: si todo falla, al menos damos contexto
 * fresco aunque no sea semánticamente relevante.
 *
 * Activado cuando: embedding Y tsvector fallan.
 */
export async function updatedAtFallback(
  portalEmail: string,
  limit: number = 5,
): Promise<FallbackFichaChunk[]> {
  const supabase = createAdminClient();

  try {
    // Traemos el primer chunk de cada ficha (chunk_index = 0) para dar contexto
    // sin saturar. Si no hay chunk_index=0, traemos el primero disponible.
    const { data, error } = await supabase
      .from('fichas_informativas')
      .select(`
        id,
        titulo,
        fichas_informativas_chunks(id, content, ficha_id)
      `)
      .eq('portal_email', portalEmail)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[retrieval] updated_at_fallback query error:', { error: error.message });
      return [];
    }

    const results: FallbackFichaChunk[] = [];
    for (const ficha of data ?? []) {
      const chunks = (ficha as unknown as { fichas_informativas_chunks: Array<{ id: string; content: string; ficha_id: string }> }).fichas_informativas_chunks ?? [];
      if (chunks.length > 0) {
        results.push({
          id:       chunks[0].id,
          content:  chunks[0].content,
          ficha_id: ficha.id,
          titulo:   ficha.titulo ?? undefined,
        });
      }
    }
    return results;
  } catch (err) {
    console.warn('[retrieval] updated_at_fallback exception:', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}
