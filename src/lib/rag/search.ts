// Búsqueda semántica sobre las fichas técnicas ingeridas. Pipeline de dos pasos:
//
//   Paso 1 (pre-filtro SQL, condicional):
//     Si se pasa meerkatRoleId, calcula la whitelist efectiva del rol y filtra
//     fichas candidatas por tag antes de hacer la búsqueda vectorial. Usa el RPC
//     match_ficha_chunks_filtered (pgvector cosine + filtro por tags en un CTE).
//
//   Paso 2 (semantic search):
//     Sobre el subset filtrado (o todo el catálogo si sin filtro), top-K con
//     distancia cosine usando el índice HNSW existente.
//
//   Fallback:
//     Si el pre-filtro devuelve 0 chunks (whitelist vacía o sin fichas candidatas),
//     se hace fallback al RPC sin filtro (match_ficha_chunks) con warning log.
//     Review Focus #4: nunca devuelve array vacío silencioso por whitelist vacía.
//
//   Backward compat:
//     Sin meerkatRoleId, comportamiento idéntico al anterior (match_ficha_chunks).

import { createAdminClient } from '@/lib/supabase/admin';
import { embedText } from './embed';
import { getEffectiveWhitelist } from '@/lib/tags/whitelist';

export interface FichaMatch {
  ficha_id:     string;
  codigo:       string;
  titulo:       string;
  chunks: Array<{
    chunk_index:  number;
    section_type: string;
    content:      string;
    similarity:   number;
  }>;
}

export interface SuggestedFicha {
  ficha_id:            string;
  codigo:              string;
  titulo:              string;
  dependencia:         string | null;
  unidad_administrativa: string | null;
  contacto_nombre:     string | null;
  contacto_puesto:     string | null;
  contacto_correo:     string | null;
  contacto_telefono:   string | null;
  contacto_extension:  string | null;
  liga_en_linea:       string | null;
  horario:             string | null;
  direccion:           string | null;
  costo_descripcion:   string | null;
  plazo_respuesta:     string | null;
}

export interface SearchResult {
  matches:         FichaMatch[];
  suggested_ficha: SuggestedFicha | null;
  confidence:      'high' | 'medium' | 'low';
  total_hits:      number;
  /** true si se activó el pre-filtro por whitelist */
  tag_filtered?:   boolean;
  /** true si el pre-filtro no devolvió resultados y se hizo fallback sin filtro */
  tag_filter_fallback?: boolean;
}

export interface SearchOpts {
  topK?:         number;
  /** Si viene, activa pre-filtro por tag whitelist del rol. Backward compat: omitir. */
  meerkatRoleId?: string;
  /**
   * Features del org (organizations.features). Cuando retrieval_v2_enabled=false,
   * el pre-filtro por whitelist se omite aunque meerkatRoleId este presente.
   * Cuando rerank_enabled=false, se pasa a shouldRerank para forzar skip.
   * Si no se pasa, se asume ON (backward compat).
   */
  orgFeatures?: Record<string, unknown>;
}

// ─── Internal chunk type from both RPCs ──────────────────────────────────────

interface ChunkHit {
  chunk_id:     string;
  ficha_id:     string;
  chunk_index:  number;
  section_type: string;
  content:      string;
  token_count:  number;
  similarity:   number;
}

// ─── Core aggregation helper ──────────────────────────────────────────────────

function aggregateHits(
  hits: ChunkHit[],
  topK: number,
): { sortedFichas: Array<{ ficha_id: string; best: number; chunks: FichaMatch['chunks'] }>; total: number } {
  const byFicha = new Map<string, { ficha_id: string; best: number; chunks: FichaMatch['chunks'] }>();

  for (const h of hits) {
    const entry = byFicha.get(h.ficha_id) ?? { ficha_id: h.ficha_id, best: -1, chunks: [] };
    entry.chunks.push({
      chunk_index:  h.chunk_index,
      section_type: h.section_type,
      content:      h.content,
      similarity:   h.similarity,
    });
    if (h.similarity > entry.best) entry.best = h.similarity;
    byFicha.set(h.ficha_id, entry);
  }

  const sortedFichas = Array.from(byFicha.values())
    .sort((a, b) => b.best - a.best)
    .slice(0, topK);

  return { sortedFichas, total: hits.length };
}

// ─── Main public function ─────────────────────────────────────────────────────

export async function searchFichas(
  query: string,
  portalEmail: string,
  opts: SearchOpts = {}
): Promise<SearchResult> {
  const topK = opts.topK ?? 5;
  const trimmed = query.trim();
  if (!trimmed) return { matches: [], suggested_ficha: null, confidence: 'low', total_hits: 0 };

  const supabase = createAdminClient();

  // Paso 1: embedding de la query
  const queryEmbedding = await embedText(trimmed, {
    source:      'nara-fichas-search',
    portalEmail,
  });

  const matchCount = Math.max(topK * 2, 15);

  // Kill switch: si retrieval_v2_enabled=false, ignorar meerkatRoleId y usar
  // path legacy sin filtro por whitelist. Backward compat: si orgFeatures no
  // se pasa, se asume que el flag esta activo (se mantiene el comportamiento
  // previo a Fase 9).
  const orgFeatures = opts.orgFeatures;
  const retrieval_v2_on =
    !orgFeatures ||
    orgFeatures.retrieval_v2_enabled === true ||
    orgFeatures.retrieval_v2_enabled === 'true';

  // ─── Path con pre-filtro por whitelist (meerkatRoleId presente) ────────────
  if (opts.meerkatRoleId && retrieval_v2_on) {
    let whitelist: string[] = [];
    try {
      whitelist = await getEffectiveWhitelist(portalEmail, opts.meerkatRoleId);
    } catch (err) {
      console.warn('[retrieval] getEffectiveWhitelist failed, degrading to no-filter:', err);
    }

    // Intentar RPC filtrado
    const { data: filteredHits, error: filteredErr } = await supabase.rpc(
      'match_ficha_chunks_filtered',
      {
        p_portal_email:        portalEmail,
        p_query_embedding:     queryEmbedding as unknown as string,
        p_effective_whitelist: whitelist,
        p_limit:               matchCount,
      },
    );

    if (filteredErr) {
      console.warn('[retrieval] match_ficha_chunks_filtered error, degrading to no-filter:', filteredErr.message);
    } else if (filteredHits && filteredHits.length > 0) {
      // Pre-filtro exitoso
      const { sortedFichas, total } = aggregateHits(filteredHits as ChunkHit[], topK);
      const result = await buildResult(supabase, sortedFichas, total, topK);
      return { ...result, tag_filtered: true };
    } else {
      // Pre-filtro devolvió 0 resultados — Review Focus #4: fallback con warning
      console.warn(
        '[retrieval] tag whitelist pre-filter returned 0 chunks for role',
        opts.meerkatRoleId,
        'portalEmail', portalEmail,
        '— falling back to unfiltered search',
      );
    }

    // Fallback: búsqueda sin filtro + flag tag_filter_fallback
    const { data: fallbackHits, error: fallbackErr } = await supabase.rpc('match_ficha_chunks', {
      query_embedding:     queryEmbedding as unknown as string,
      portal_email_filter: portalEmail,
      match_count:         matchCount,
    });

    if (fallbackErr) {
      console.warn('[retrieval] match_ficha_chunks fallback error:', fallbackErr.message);
      return { matches: [], suggested_ficha: null, confidence: 'low', total_hits: 0, tag_filter_fallback: true };
    }
    if (!fallbackHits || fallbackHits.length === 0) {
      return { matches: [], suggested_ficha: null, confidence: 'low', total_hits: 0, tag_filter_fallback: true };
    }

    const { sortedFichas, total } = aggregateHits(fallbackHits as ChunkHit[], topK);
    const result = await buildResult(supabase, sortedFichas, total, topK);
    return { ...result, tag_filter_fallback: true };
  }

  // ─── Path sin filtro (backward compat — sin meerkatRoleId) ────────────────
  const { data: hits, error } = await supabase.rpc('match_ficha_chunks', {
    query_embedding:     queryEmbedding as unknown as string,
    portal_email_filter: portalEmail,
    match_count:         matchCount,
  });
  if (error) throw new Error(`match_ficha_chunks error: ${error.message}`);
  if (!hits || hits.length === 0) {
    return { matches: [], suggested_ficha: null, confidence: 'low', total_hits: 0 };
  }

  const { sortedFichas, total } = aggregateHits(hits as ChunkHit[], topK);
  return buildResult(supabase, sortedFichas, total, topK);
}

// ─── Build result from sorted fichas ─────────────────────────────────────────

async function buildResult(
  supabase: ReturnType<typeof createAdminClient>,
  sortedFichas: Array<{ ficha_id: string; best: number; chunks: FichaMatch['chunks'] }>,
  total: number,
  topK: number,
): Promise<SearchResult> {
  if (sortedFichas.length === 0) {
    return { matches: [], suggested_ficha: null, confidence: 'low', total_hits: 0 };
  }

  const fichaIds = sortedFichas.map((f) => f.ficha_id);
  const { data: fichas, error: fErr } = await supabase
    .from('fichas_informativas')
    .select('id, codigo, titulo, dependencia, unidad_administrativa, contacto_nombre, contacto_puesto, contacto_correo, contacto_telefono, contacto_extension, liga_en_linea, horario, direccion, costo_descripcion, plazo_respuesta')
    .in('id', fichaIds);
  if (fErr) throw new Error(`fetch fichas error: ${fErr.message}`);

  const fichaById = new Map((fichas ?? []).map((f) => [f.id, f]));

  const matches: FichaMatch[] = sortedFichas.slice(0, topK).map((entry) => {
    const f = fichaById.get(entry.ficha_id);
    return {
      ficha_id: entry.ficha_id,
      codigo:   f?.codigo ?? '',
      titulo:   f?.titulo ?? '',
      // Top 3 chunks por ficha para no saturar el contexto del LLM
      chunks: entry.chunks
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3),
    };
  });

  const topFicha = fichaById.get(sortedFichas[0].ficha_id);
  const suggested: SuggestedFicha | null = topFicha
    ? {
        ficha_id:              topFicha.id,
        codigo:                topFicha.codigo,
        titulo:                topFicha.titulo,
        dependencia:           topFicha.dependencia,
        unidad_administrativa: topFicha.unidad_administrativa,
        contacto_nombre:       topFicha.contacto_nombre,
        contacto_puesto:       topFicha.contacto_puesto,
        contacto_correo:       topFicha.contacto_correo,
        contacto_telefono:     topFicha.contacto_telefono,
        contacto_extension:    topFicha.contacto_extension,
        liga_en_linea:         topFicha.liga_en_linea,
        horario:               topFicha.horario,
        direccion:             topFicha.direccion,
        costo_descripcion:     topFicha.costo_descripcion,
        plazo_respuesta:       topFicha.plazo_respuesta,
      }
    : null;

  const bestSim = sortedFichas[0].best;
  const confidence: SearchResult['confidence'] =
    bestSim > 0.7 ? 'high' : bestSim > 0.4 ? 'medium' : 'low';

  return {
    matches,
    suggested_ficha: suggested,
    confidence,
    total_hits:      total,
  };
}
