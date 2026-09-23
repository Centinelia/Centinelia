// Búsqueda semántica sobre las fichas técnicas ingeridas. Compone:
//   1. embed(query) → vector 1536
//   2. RPC match_ficha_chunks (pgvector cosine, HNSW)
//   3. Deduplica ficha y consolida hits en secciones útiles
//   4. Carga la metadata de la ficha (contactos, liga, horario) para que Nara
//      pueda cascadear con `transferir_a_extension` cuando el ciudadano
//      necesita algo específico.

import { createAdminClient } from '@/lib/supabase/admin';
import { embedText } from './embed';

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
}

export interface SearchOpts {
  topK?:  number;
}

export async function searchFichas(
  query: string,
  portalEmail: string,
  opts: SearchOpts = {}
): Promise<SearchResult> {
  const topK = opts.topK ?? 5;
  const trimmed = query.trim();
  if (!trimmed) return { matches: [], suggested_ficha: null, confidence: 'low', total_hits: 0 };

  const supabase = createAdminClient();

  const queryEmbedding = await embedText(trimmed, {
    source:      'nara-fichas-search',
    portalEmail,
  });

  // Traemos top-K + margen para dedupe por ficha.
  const { data: hits, error } = await supabase.rpc('match_ficha_chunks', {
    query_embedding:     queryEmbedding as unknown as string,
    portal_email_filter: portalEmail,
    match_count:         Math.max(topK * 2, 10),
  });
  if (error) throw new Error(`match_ficha_chunks error: ${error.message}`);
  if (!hits || hits.length === 0) {
    return { matches: [], suggested_ficha: null, confidence: 'low', total_hits: 0 };
  }

  // Agrupar chunks por ficha manteniendo el mejor score.
  const byFicha = new Map<string, {
    ficha_id: string;
    best:     number;
    chunks:   FichaMatch['chunks'];
  }>();
  for (const h of hits as Array<{
    chunk_id: string; ficha_id: string; chunk_index: number;
    section_type: string; content: string; token_count: number; similarity: number;
  }>) {
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
  const sortedFichas = Array.from(byFicha.values()).sort((a, b) => b.best - a.best);

  // Cargar metadata de las fichas involucradas
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
    total_hits:      hits.length,
  };
}
