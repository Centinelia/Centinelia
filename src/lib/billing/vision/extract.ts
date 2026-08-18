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

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Vision model returned non-JSON output');
  }

  return JSON.parse(jsonMatch[0]) as ExtractedNote;
}
