/**
 * Servicio de autotag para fichas informativas.
 *
 * Classifica el contenido de una ficha con Claude Sonnet 4.6 y devuelve
 * entre 1 y 3 tags del catálogo controlado (15 slugs).
 *
 * COBRO: el autotag síncrono al crear una ficha NO cobra ops al cliente.
 * Es parte del setup de la ficha (costo absorbido por Centinelia, ~$0.001).
 * Ver feedback_batch_eval_no_charge y spec Sección 3 "Cobro autotag".
 *
 * LOGGING: logLlmCall obligatorio. Enforced por `pnpm lint`.
 * Ver feedback_anthropic_debe_loggearse.
 *
 * TIMEOUT: 5 segundos. Si excede, devuelve status='pending'.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';
import {
  VALID_TAG_SLUGS,
  buildAutotagSystemPrompt,
  buildAutotagUserMessage,
} from './prompt';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-6';
const AUTOTAG_TIMEOUT_MS = 5_000;

export interface AutotagResult {
  tags:   string[];
  status: 'done' | 'error' | 'pending';
}

/**
 * Clasifica el contenido de una ficha y devuelve sus tags.
 *
 * @param portalEmail  Portal del org (para logLlmCall).
 * @param contenido    Texto libre del contenido de la ficha.
 * @returns            Tags y status del autotag.
 */
export async function autotagFicha(
  portalEmail: string,
  contenido:   string,
): Promise<AutotagResult> {
  if (!contenido || contenido.trim().length < 20) {
    return { tags: ['politicas'], status: 'done' };
  }

  // Truncar a 4000 chars para no desperdiciar tokens en textos enormes.
  const contenidoTruncado = contenido.length > 4_000
    ? contenido.slice(0, 4_000) + '\n[...truncado]'
    : contenido;

  const __start = Date.now();
  let response: Anthropic.Message | null = null;
  let llmError: string | undefined;

  try {
    // Race contra timeout de 5 s
    const responseOrTimeout = await Promise.race([
      anthropic.messages.create({
        model:      MODEL,
        max_tokens: 128,
        system:     buildAutotagSystemPrompt(),
        messages: [{
          role:    'user',
          content: buildAutotagUserMessage(contenidoTruncado),
        }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('autotag_timeout')), AUTOTAG_TIMEOUT_MS)
      ),
    ]);

    response = responseOrTimeout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    llmError = msg;

    if (msg === 'autotag_timeout') {
      // Timeout: el caller marcará la ficha como 'pending' para retry async.
      void logLlmCall({
        source:       'autotag_service',
        model:        MODEL,
        usage:        { input_tokens: 0, output_tokens: 0 },
        portalEmail,
        latencyMs:    AUTOTAG_TIMEOUT_MS,
        error:        'autotag_timeout',
      });
      return { tags: [], status: 'pending' };
    }

    // Error de red u otro — status='error'
    void logLlmCall({
      source:       'autotag_service',
      model:        MODEL,
      usage:        { input_tokens: 0, output_tokens: 0 },
      portalEmail,
      latencyMs:    Date.now() - __start,
      error:        msg,
    });
    return { tags: [], status: 'error' };
  }

  // Log exitoso
  void logLlmCall({
    source:       'autotag_service',
    model:        MODEL,
    usage:        response.usage,
    portalEmail,
    latencyMs:    Date.now() - __start,
  });

  // Parsear respuesta
  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  return parseAutotagResponse(rawText);
}

/**
 * Parsea la respuesta JSON del LLM y valida los slugs.
 * Exported para tests unitarios.
 */
export function parseAutotagResponse(rawText: string): AutotagResult {
  // Extraer JSON del texto (puede tener whitespace o texto extra)
  const jsonMatch = rawText.match(/\{[^}]*"tags"\s*:\s*\[[^\]]*\][^}]*\}/s);
  if (!jsonMatch) {
    console.warn('[autotag] JSON no encontrado en respuesta:', rawText.slice(0, 200));
    return { tags: ['politicas'], status: 'done' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    console.warn('[autotag] JSON malformado en respuesta:', jsonMatch[0].slice(0, 200));
    return { tags: ['politicas'], status: 'done' };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).tags)
  ) {
    return { tags: ['politicas'], status: 'done' };
  }

  const rawTags: unknown[] = (parsed as { tags: unknown[] }).tags;

  // Validar que todos los slugs están en el catálogo
  const validSlugs = new Set<string>(VALID_TAG_SLUGS);
  const invalidSlugs = rawTags.filter(
    (s) => typeof s !== 'string' || !validSlugs.has(s as string)
  );

  if (invalidSlugs.length > 0) {
    console.warn('[autotag] Slugs fuera de catálogo detectados:', invalidSlugs);
    // Filtrar solo los válidos. Si quedan 0, fallback a 'politicas'.
    const filtered = (rawTags as string[]).filter(s => validSlugs.has(s));
    const tags = filtered.length > 0 ? filtered.slice(0, 3) : ['politicas'];
    return { tags, status: 'done' };
  }

  // Validar length (1-3)
  if (rawTags.length < 1 || rawTags.length > 3) {
    const clamped = (rawTags as string[]).slice(0, 3);
    const tags = clamped.length > 0 ? clamped : ['politicas'];
    return { tags, status: 'done' };
  }

  return { tags: rawTags as string[], status: 'done' };
}
