/**
 * extract.ts -- Vision AI wrapper para extraer datos de notitas de venta manuscritas.
 *
 * Historia:
 *   - v1 (Task 8): 1 foto = 1 notita. ExtractedNote flat.
 *   - v2 (2026-09-03, post-audit): fotos pueden tener múltiples remisiones
 *     apiladas. ExtractedNoteSet con `remisiones: ExtractedRemision[]`.
 *     `ExtractedNote` se preserva como alias de `ExtractedRemision` para
 *     que los callers que solo esperan 1 notita (portal /facturacion-emision)
 *     sigan funcionando via `flattenSingleRemision`.
 *
 * Usa claude-sonnet-4-6 por default (configurable via BILLING_VISION_MODEL).
 */

import Anthropic from '@anthropic-ai/sdk';
import { EXTRACT_NOTE_SYSTEM, EXTRACT_NOTE_USER } from './prompt';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// ── Shape v2 ─────────────────────────────────────────────────────────────────

export interface ExtractedProduct {
  nombre: string;
  cantidad: number | null;
  unidad: string | null;
  /** Precio unitario preimpreso en la columna P.UNIT, o manuscrito si fue modificado. */
  precio_unitario: number | null;
}

export interface ExtractedRemision {
  /** Número de folio grande arriba a la derecha (típicamente 4-5 dígitos). */
  folio_remision: string | null;
  cliente_texto: string | null;
  fecha: string | null;
  productos: ExtractedProduct[];
  metodo_pago: 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | null;
  monto_total: number | null;
  confianza: {
    cliente: number;
    productos: number;
    metodo_pago: number;
    global: number;
  };
  notas_raw: string;
}

export interface ExtractedNoteSet {
  remisiones: ExtractedRemision[];
  confianza_global: number;
  notas_raw_all: string;
}

/** Alias legacy — un caller que espera 1 notita puede seguir tipando `ExtractedNote`. */
export type ExtractedNote = ExtractedRemision;

// ── Vision call ──────────────────────────────────────────────────────────────

/**
 * Extrae UNA o VARIAS remisiones de una foto. Si la foto solo tiene una
 * remisión, `remisiones` será array de 1.
 */
export async function extractRemisionesFromImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ExtractedNoteSet> {
  const model = process.env.BILLING_VISION_MODEL ?? DEFAULT_MODEL;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: EXTRACT_NOTE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: EXTRACT_NOTE_USER,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock?.type === 'text' ? textBlock.text.trim() : '';

  const parsed = extractFirstJsonObject(raw);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { remisiones?: unknown }).remisiones)) {
    throw new Error('Vision model returned non-JSON or missing remisiones[] array');
  }

  return parsed as ExtractedNoteSet;
}

/**
 * Wrapper legacy: extrae una foto y devuelve la primera (y esperada única)
 * remisión. Útil para callers que asumen 1 foto = 1 notita (ej. portal de
 * facturación-emisión, tool `extract_note` del employee cuando el usuario
 * garantiza upload individual).
 *
 * Si la foto tiene múltiples remisiones, tira error para que el caller
 * decida si escalar o iterar. NO devuelve silenciosamente la primera —
 * ese sería un bug silencioso donde se pierden ventas.
 */
export async function extractNoteFromImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ExtractedRemision> {
  const set = await extractRemisionesFromImage(imageBuffer, mimeType);
  if (set.remisiones.length === 0) {
    throw new Error('Vision model devolvió 0 remisiones — imagen ilegible o no es una notita');
  }
  if (set.remisiones.length > 1) {
    throw new Error(
      `Vision model detectó ${set.remisiones.length} remisiones en la imagen; ` +
      `usar extractRemisionesFromImage() en lugar de extractNoteFromImage() para procesarlas todas`,
    );
  }
  return set.remisiones[0];
}

// ── JSON helper ──────────────────────────────────────────────────────────────

/**
 * Extrae el primer objeto JSON balanceado de un string. Tolera texto antes o
 * después (código markdown, explicaciones libres). Ignora llaves dentro de
 * strings (respeta escapes).
 */
function extractFirstJsonObject(s: string): unknown | null {
  const first = s.indexOf('{');
  if (first === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = first; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(s.slice(first, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}
