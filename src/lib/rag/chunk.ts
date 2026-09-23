// Chunking semántico + fallback recursivo para las fichas de trámites de Nara.
//
// Estrategia:
//   1. Cada sección semántica (descripción, requisitos, pasos, etc.) genera al
//      menos un chunk. Preserva la coherencia temática para el retrieval.
//   2. Si el contenido de una sección excede el límite (800 tokens estimados),
//      se hace split recursivo con overlap. Preferimos cortar en párrafo o en
//      final de oración cerca del límite.
//   3. Un chunk 'header' opcional lleva código + título + dependencia. Sirve
//      como ancla contextual: casi cualquier query relevante recupera este
//      chunk junto con el específico.
//
// Estimación de tokens: 4 caracteres por token (heurística para español).
// No usamos tiktoken porque agregaría dependencia y para el orden de magnitud
// que manejamos la aproximación es más que suficiente.

import type { ParsedSection, FichaSectionType } from './parse-ficha-santiago';

export interface Chunk {
  chunk_index:  number;
  section_type: FichaSectionType;
  content:      string;
  token_count:  number;
}

const CHARS_PER_TOKEN   = 4;
const MAX_CHUNK_TOKENS  = 800;
const OVERLAP_TOKENS    = 100;
const MAX_CHUNK_CHARS   = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS     = OVERLAP_TOKENS * CHARS_PER_TOKEN;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function splitLongContent(text: string, maxChars: number, overlapChars: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxChars, text.length);
    if (end < text.length) {
      // Buscar breakpoint natural cerca del límite (ventana de 200 chars hacia atrás).
      const searchStart = Math.max(end - 200, i + Math.floor(maxChars / 2));
      const paragraph   = text.lastIndexOf('\n\n', end);
      if (paragraph >= searchStart) {
        end = paragraph;
      } else {
        const sentence = text.lastIndexOf('. ', end);
        if (sentence >= searchStart) end = sentence + 1;
      }
    }
    const slice = text.slice(i, end).trim();
    if (slice.length > 0) out.push(slice);
    if (end >= text.length) break;
    // Next start with overlap
    const next = end - overlapChars;
    i = next > i ? next : end;
  }
  return out;
}

export function chunkSections(sections: ParsedSection[], header?: string): Chunk[] {
  const chunks: Chunk[] = [];
  let idx = 0;

  if (header && header.trim().length > 0) {
    chunks.push({
      chunk_index:  idx++,
      section_type: 'header',
      content:      header.trim(),
      token_count:  estimateTokens(header),
    });
  }

  for (const sec of sections) {
    const cleaned = sec.content.trim();
    if (cleaned.length === 0) continue;

    const est = estimateTokens(cleaned);
    if (est <= MAX_CHUNK_TOKENS) {
      chunks.push({
        chunk_index:  idx++,
        section_type: sec.type,
        content:      cleaned,
        token_count:  est,
      });
      continue;
    }

    const pieces = splitLongContent(cleaned, MAX_CHUNK_CHARS, OVERLAP_CHARS);
    for (const piece of pieces) {
      chunks.push({
        chunk_index:  idx++,
        section_type: sec.type,
        content:      piece,
        token_count:  estimateTokens(piece),
      });
    }
  }

  return chunks;
}
