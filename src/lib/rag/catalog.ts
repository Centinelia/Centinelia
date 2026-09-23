// Catálogo completo de fichas de trámites — modo 'stuffed' del pack
// fichas_informativas. Se llama desde el executor cuando el mode del org es
// 'stuffed' (default). Trae TODAS las fichas del portal con sus secciones
// para que Nara elija la relevante en su razonamiento.
//
// Uso ideal: los volúmenes chicos (20-60 fichas cortas) caben cómodo en el
// contexto de Sonnet/Opus con caching, sin necesidad de vector search.
// Para volúmenes grandes, cambiar `organizations.features.fichas_informativas_mode`
// a 'embeddings' y usar `searchFichas` (src/lib/rag/search.ts).

import { createAdminClient } from '@/lib/supabase/admin';

export interface CatalogFicha {
  ficha_id:              string;
  codigo:                string;
  titulo:                string;
  dependencia:           string | null;
  unidad_administrativa: string | null;
  contacto: {
    nombre:    string | null;
    puesto:    string | null;
    correo:    string | null;
    telefono:  string | null;
    extension: string | null;
  };
  liga_en_linea:         string | null;
  horario:               string | null;
  direccion:             string | null;
  costo_descripcion:     string | null;
  plazo_respuesta:       string | null;
  secciones: Array<{
    section_type: string;
    content:      string;
  }>;
}

export interface CatalogResult {
  fichas:      CatalogFicha[];
  total:       number;
  approx_tokens: number;
}

// Aproximación 4 chars/token para español. Útil para que el LLM sepa el
// tamaño del catálogo y no truncarlo por accidente.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function loadFichasCatalog(portalEmail: string): Promise<CatalogResult> {
  const supabase = createAdminClient();

  const { data: fichas, error } = await supabase
    .from('fichas_informativas')
    .select('id, codigo, titulo, dependencia, unidad_administrativa, contacto_nombre, contacto_puesto, contacto_correo, contacto_telefono, contacto_extension, liga_en_linea, horario, direccion, costo_descripcion, plazo_respuesta')
    .eq('portal_email', portalEmail)
    .order('codigo');
  if (error) throw new Error(`load fichas error: ${error.message}`);
  if (!fichas || fichas.length === 0) return { fichas: [], total: 0, approx_tokens: 0 };

  const fichaIds = fichas.map((f) => f.id);
  const { data: chunks, error: chunkErr } = await supabase
    .from('fichas_informativas_chunks')
    .select('ficha_id, chunk_index, section_type, content')
    .in('ficha_id', fichaIds)
    .order('ficha_id')
    .order('chunk_index');
  if (chunkErr) throw new Error(`load chunks error: ${chunkErr.message}`);

  const chunksByFicha = new Map<string, Array<{ section_type: string; content: string }>>();
  for (const c of chunks ?? []) {
    const arr = chunksByFicha.get(c.ficha_id) ?? [];
    arr.push({ section_type: c.section_type, content: c.content });
    chunksByFicha.set(c.ficha_id, arr);
  }

  let totalChars = 0;
  const out: CatalogFicha[] = fichas.map((f) => {
    const secciones = chunksByFicha.get(f.id) ?? [];
    for (const s of secciones) totalChars += s.content.length;
    totalChars += (f.titulo?.length ?? 0) + (f.dependencia?.length ?? 0);
    return {
      ficha_id:              f.id,
      codigo:                f.codigo,
      titulo:                f.titulo,
      dependencia:           f.dependencia,
      unidad_administrativa: f.unidad_administrativa,
      contacto: {
        nombre:    f.contacto_nombre,
        puesto:    f.contacto_puesto,
        correo:    f.contacto_correo,
        telefono:  f.contacto_telefono,
        extension: f.contacto_extension,
      },
      liga_en_linea:      f.liga_en_linea,
      horario:            f.horario,
      direccion:          f.direccion,
      costo_descripcion:  f.costo_descripcion,
      plazo_respuesta:    f.plazo_respuesta,
      secciones,
    };
  });

  return {
    fichas:         out,
    total:          out.length,
    approx_tokens:  estimateTokens(String(totalChars)) * 0 + Math.ceil(totalChars / 4),
  };
}
