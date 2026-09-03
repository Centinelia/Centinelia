/**
 * extract.ts -- Vision AI wrapper para extraer datos de notitas de venta manuscritas.
 *
 * Usa claude-sonnet-4-6 por default (configurable via BILLING_VISION_MODEL).
 * Patron: instancia Anthropic inline, mismo estilo del resto del codebase.
 *
 * Consumidores: Task 8 (billing flow orquestador).
 */

import Anthropic from '@anthropic-ai/sdk';
import { EXTRACT_NOTE_SYSTEM, EXTRACT_NOTE_USER } from './prompt';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

export interface ExtractedProduct {
  nombre: string;
  cantidad: number;
  unidad: string | null;
}

export interface ExtractedNote {
  cliente_texto: string | null;
  productos: ExtractedProduct[];
  metodo_pago: 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | null;
  fecha: string | null;
  monto_total: number | null;
  confianza: {
    cliente: number;
    productos: number;
    metodo_pago: number;
    global: number;
  };
  notas_raw: string;
}

/**
 * Extrae los datos estructurados de una notita de venta manuscrita.
 *
 * @param imageBuffer - Buffer con el contenido binario de la imagen.
 * @param mimeType    - MIME type de la imagen (e.g. "image/jpeg", "image/png").
 * @returns ExtractedNote con los campos extraidos y scores de confianza.
 * @throws Error si el modelo no devuelve JSON parseable.
 */
export async function extractNoteFromImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ExtractedNote> {
  const model = process.env.BILLING_VISION_MODEL ?? DEFAULT_MODEL;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
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
  if (!parsed) {
    throw new Error('Vision model returned non-JSON output');
  }

  return parsed as ExtractedNote;
}

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
