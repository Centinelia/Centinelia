/**
 * Extractor de facts desde un transcript de llamada (F9.1).
 *
 * Sigue el patrón del artículo Graph Engineering con Opus 5:
 * - Schema estable como system prompt cacheado (cache_control: ephemeral).
 * - Effort bajo (usamos Haiku 4.5 — extracción es mecánica).
 * - Batch API a futuro (ver F5.2) para backfill masivo.
 *
 * El prefijo cacheado incluye vocabulario de predicates + reglas + JSON schema.
 * El transcript variable va como user message al final.
 */

import Anthropic from '@anthropic-ai/sdk';
import { PREDICATES } from './types';
import type { ExtractedFact } from './types';

const anthropic = new Anthropic();

const EXTRACTION_SYSTEM = `Extrae hechos verificables de la transcripción de una llamada telefónica de negocios.

Solo hechos EXPLÍCITAMENTE afirmados. Nunca inferencias débiles ni suposiciones.
Nunca inventes montos, fechas ni nombres.

VOCABULARIO DE PREDICATES — usa SOLO estos:
${PREDICATES.map(p => `  - ${p}`).join('\n')}

TIPOS DE ENTIDAD:
  - customer   (persona externa que llama o es contactada)
  - business   (empresa cliente o del cliente)
  - employee   (empleado del negocio dueño del agente)
  - place      (ubicación física)
  - other

FORMATO DE SALIDA — JSON estricto:
{
  "facts": [
    {
      "subject":   { "name": "Nombre", "type": "customer" },
      "predicate": "owes",
      "object":    { "number": 8500 },
      "confidence": 0.95
    },
    {
      "subject":   { "name": "Juan Pérez", "type": "customer" },
      "predicate": "promised_to_pay_on",
      "object":    { "date": "2026-07-30" },
      "confidence": 0.9
    },
    {
      "subject":   { "name": "Juan Pérez", "type": "customer" },
      "predicate": "lives_at",
      "object":    { "text": "Colonia Centro" },
      "confidence": 0.85
    }
  ]
}

REGLAS:
- Un fact por hecho atómico. No combines varias afirmaciones.
- Si la fecha se dice relativa ("mañana", "el martes"), NO adivines fecha
  absoluta — reporta el texto tal cual en object.text, no en object.date.
- Confidence < 0.7 = solo lo dijeron implícitamente. Confidence 1.0 = lo
  afirmó explícitamente sin ambigüedad.
- Si el transcript no tiene facts verificables (ej. llamada corta, sin
  datos), devuelve { "facts": [] }.
- Nombres: normaliza espacios pero conserva mayúsculas ("Juan Pérez", no
  "juan perez").
- Montos: number en pesos, sin símbolo de moneda ("$8,500" → 8500).
- Fechas: ISO 8601 (YYYY-MM-DD).

Responde ÚNICAMENTE con el JSON, sin markdown, sin texto adicional.`;

export interface ExtractFromTranscriptInput {
  transcript:  string;
  callerName?: string;   // hint del entity principal
  model?:      string;   // default: haiku
}

export interface ExtractFromTranscriptResult {
  facts:               ExtractedFact[];
  cacheReadTokens:     number;
  cacheCreatedTokens:  number;
  inputTokens:         number;
  outputTokens:        number;
}

export async function extractFromTranscript(input: ExtractFromTranscriptInput): Promise<ExtractFromTranscriptResult> {
  const model = input.model ?? 'claude-haiku-4-5-20251001';

  const response = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    system: [{
      type: 'text',
      text: EXTRACTION_SYSTEM,
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{
      role: 'user',
      content: [
        input.callerName ? `HINT: la llamada es con "${input.callerName}".` : '',
        '',
        'TRANSCRIPT:',
        input.transcript.slice(0, 8000),   // cap defensivo — llamadas muy largas se recortan
      ].filter(Boolean).join('\n'),
    }],
  });

  const usage = response.usage as unknown as {
    input_tokens:               number;
    output_tokens:              number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?:    number;
  };

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  const match = rawText.match(/\{[\s\S]*\}/);
  let facts: ExtractedFact[] = [];
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { facts?: ExtractedFact[] };
      facts = validateFacts(parsed.facts ?? []);
    } catch (err) {
      console.warn('[memory/extract] JSON parse failed, treating as empty:', err);
    }
  }

  return {
    facts,
    cacheReadTokens:    usage.cache_read_input_tokens    ?? 0,
    cacheCreatedTokens: usage.cache_creation_input_tokens ?? 0,
    inputTokens:        usage.input_tokens,
    outputTokens:       usage.output_tokens,
  };
}

/** Guards básicos: quita facts mal formados sin explotar. */
function validateFacts(raw: unknown[]): ExtractedFact[] {
  const validPredicates = new Set<string>(PREDICATES);
  const clean: ExtractedFact[] = [];

  for (const f of raw) {
    if (!f || typeof f !== 'object') continue;
    const fact = f as Record<string, unknown>;
    const subject = fact.subject as { name?: unknown; type?: unknown } | undefined;
    if (!subject || typeof subject.name !== 'string' || typeof subject.type !== 'string') continue;
    if (!validPredicates.has(fact.predicate as string)) continue;

    const objectRaw = fact.object as Record<string, unknown> | undefined;
    const object: ExtractedFact['object'] = {};
    if (objectRaw) {
      if (typeof objectRaw.text   === 'string') object.text   = objectRaw.text.slice(0, 500);
      if (typeof objectRaw.number === 'number') object.number = objectRaw.number;
      if (typeof objectRaw.date   === 'string' && /^\d{4}-\d{2}-\d{2}/.test(objectRaw.date)) object.date = objectRaw.date;
      if (objectRaw.entity && typeof objectRaw.entity === 'object') {
        const oe = objectRaw.entity as { name?: unknown; type?: unknown };
        if (typeof oe.name === 'string' && typeof oe.type === 'string') {
          object.entity = { name: oe.name, type: oe.type as ExtractedFact['subject']['type'] };
        }
      }
    }

    const confidence = typeof fact.confidence === 'number'
      ? Math.max(0, Math.min(1, fact.confidence))
      : 1.0;

    clean.push({
      subject:    { name: subject.name.slice(0, 200), type: subject.type as ExtractedFact['subject']['type'] },
      predicate:  fact.predicate as ExtractedFact['predicate'],
      object:     Object.keys(object).length > 0 ? object : undefined,
      confidence,
    });
  }
  return clean;
}
