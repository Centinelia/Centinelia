/**
 * Rerank condicional de fragmentos de fichas informativas usando Claude Haiku.
 *
 * Se activa cuando:
 *   1. La organización tiene más de RERANK_TRIGGER_THRESHOLD_FICHAS fichas totales.
 *   2. Los top-5 candidatos semánticos tienen distancias muy cercanas (delta < RERANK_TRIGGER_DISTANCE_DELTA).
 *   3. El feature flag `rerank_enabled` en organizations.features es `true`.
 *
 * Cobro: absorbido en el "1 op runtime" que la ficha ya cobra.
 * NO se cobra extra al cliente por rerank (costo interno Centinelia).
 *
 * Error handling: si Haiku falla o el JSON es inválido, retorna los candidatos
 * originales sin rerank + warning log (fallback defensivo).
 *
 * Ver: docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md Sección 6.3
 */

import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';

// ─── Constantes de configuración ────────────────────────────────────────────

const RERANK_TRIGGER_THRESHOLD_FICHAS = 100;
const RERANK_TRIGGER_DISTANCE_DELTA   = 0.05;
const RERANK_MODEL                    = 'claude-haiku-4-5';
const RERANK_SOURCE                   = 'fichas-rerank-haiku';

// Máximo de caracteres del preview de contenido enviado al reranker.
// Limitar para controlar tokens de Haiku.
const CONTENT_PREVIEW_CHARS = 200;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface RerankCandidate {
  id:        string;
  content:   string;
  titulo?:   string;
  /** Distancia cosine (1 - similarity). Menor = más cercano. */
  distance:  number;
}

export interface RerankInput {
  query:      string;
  candidates: RerankCandidate[];
  targetK:    number;
  portalEmail?: string;
}

export interface RerankResult {
  id:    string;
  score: number;
}

// ─── Condiciones de activación ────────────────────────────────────────────────

export interface RerankTriggerContext {
  totalFichas: number;
  candidates:  RerankCandidate[];
  orgFeatures: Record<string, unknown>;
}

/**
 * Evalúa si se debe activar el rerank para este contexto.
 * Retorna true si alguna condición se cumple.
 *
 * Kill switch (Fase 9.2): si rerank_enabled=false en orgFeatures, retorna false
 * incondicionalmente — ninguna otra condicion puede activar rerank.
 * Backward compat: si orgFeatures no tiene la clave, las condiciones de volumen
 * y distancia siguen funcionando como antes.
 */
export function shouldRerank(ctx: RerankTriggerContext): boolean {
  // Kill switch: rerank_enabled=false desactiva el rerank aunque se cumplan
  // las condiciones de volumen o distancia.
  const flagValue = ctx.orgFeatures.rerank_enabled;
  if (flagValue === false || flagValue === 'false') return false;

  // Condición 3: feature flag explícito ON
  if (flagValue === true || flagValue === 'true') return true;

  // Condición 1: muchas fichas en el org
  if (ctx.totalFichas > RERANK_TRIGGER_THRESHOLD_FICHAS) return true;

  // Condición 2: top-5 con distancias muy similares (señal de ruido semántico)
  const top5 = ctx.candidates.slice(0, 5);
  if (top5.length >= 2) {
    const distances = top5.map((c) => c.distance);
    const maxDist   = Math.max(...distances);
    const minDist   = Math.min(...distances);
    if (maxDist - minDist < RERANK_TRIGGER_DISTANCE_DELTA) return true;
  }

  return false;
}

// ─── Rerank con Haiku ─────────────────────────────────────────────────────────

// Lazy singleton — tests pueden resetear con vi.resetModules() si necesitan.
// En prod, el proceso Node vive por el tiempo del request (serverless), así que
// el singleton ahorra la creación repetida del cliente en requests intensivos.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/** Solo para tests: resetea el singleton para que el mock se reinicialice. */
export function _resetClientForTests(): void {
  _client = null;
}

/**
 * Pide a Haiku que elija los targetK fragmentos más relevantes.
 * Retorna lista ordenada de { id, score } donde score=1 para los elegidos, 0 para los demás.
 * En caso de error, retorna los candidatos originales en orden (score derivado de -distance).
 */
export async function rerankCandidates(input: RerankInput): Promise<RerankResult[]> {
  const { query, candidates, targetK, portalEmail } = input;

  if (candidates.length === 0) return [];
  if (candidates.length <= targetK) {
    // No hay nada que reordenar — devolver en orden original
    return candidates.map((c, i) => ({ id: c.id, score: 1 - i * 0.01 }));
  }

  // Construir la lista de fragmentos para el prompt
  const fragmentLines = candidates.map((c, idx) => {
    const preview = c.content.slice(0, CONTENT_PREVIEW_CHARS);
    const tituloLine = c.titulo ? `titulo: ${c.titulo}, ` : '';
    return `${idx + 1}. [id: ${c.id}, ${tituloLine}contenido_preview: ${preview}]`;
  });

  const systemPrompt = `Eres un asistente de recuperación de información para un sistema de fichas informativas empresariales.
Tu tarea es elegir los fragmentos más relevantes para responder la pregunta del usuario.
Responde ÚNICAMENTE con un objeto JSON válido en el formato indicado. Sin texto adicional, sin markdown, sin explicaciones.`;

  const userPrompt = `Pregunta del usuario: "${query}"

Fragmentos recuperados:
${fragmentLines.join('\n')}

Selecciona exactamente los ${targetK} fragmentos que REALMENTE responden esta pregunta.
Devuelve SOLO el JSON: {"ids": ["id_1", "id_2", ...]}`;

  const t0 = Date.now();
  let response: Anthropic.Message | null = null;

  try {
    // timeout: 5000 ms — si Haiku demora más, el SDK lanza APIError con código ETIMEDOUT.
    // Esto evita que un Haiku lento exceda el timeout de Vercel (30s) sin que el
    // catch handler pueda actuar. El SDK 0.116.0 acepta timeout en RequestOptions
    // (segundo argumento de messages.create).
    response = await getClient().messages.create(
      {
        model:      RERANK_MODEL,
        max_tokens: 256,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      },
      { timeout: 5000 },
    );

    logLlmCall({
      source:      RERANK_SOURCE,
      model:       RERANK_MODEL,
      usage: {
        input_tokens:  response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      portalEmail: portalEmail ?? null,
      latencyMs:   Date.now() - t0,
    }).catch((err: unknown) => console.error('[rerank] logLlmCall failed:', err));
  } catch (err) {
    logLlmCall({
      source:      RERANK_SOURCE,
      model:       RERANK_MODEL,
      usage:       { input_tokens: 0, output_tokens: 0 },
      portalEmail: portalEmail ?? null,
      latencyMs:   Date.now() - t0,
      error:       err instanceof Error ? err.message : String(err),
    }).catch((logErr: unknown) => console.error('[rerank] logLlmCall failed:', logErr));
    console.warn('[rerank] Haiku failed, returning original order:', err);
    return fallbackOrder(candidates);
  }

  // Parsear el JSON de respuesta
  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let chosenIds: string[] = [];
  try {
    const parsed = JSON.parse(rawText) as { ids?: unknown };
    if (Array.isArray(parsed.ids)) {
      chosenIds = parsed.ids.filter((id): id is string => typeof id === 'string');
    } else {
      throw new Error('ids is not an array');
    }
  } catch (parseErr) {
    console.warn('[rerank] JSON parse failed, returning original order:', parseErr, 'raw:', rawText);
    return fallbackOrder(candidates);
  }

  // Construir resultado: chosen reciben score 1-(rank/targetK), resto recibe score 0
  const chosenSet = new Set(chosenIds);
  const results: RerankResult[] = [];

  let rank = 0;
  for (const id of chosenIds) {
    if (candidates.some((c) => c.id === id)) {
      results.push({ id, score: 1 - rank / Math.max(targetK, 1) });
      rank++;
    }
  }

  // Agregar los no elegidos al final con score 0
  for (const c of candidates) {
    if (!chosenSet.has(c.id)) {
      results.push({ id: c.id, score: 0 });
    }
  }

  return results;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fallbackOrder(candidates: RerankCandidate[]): RerankResult[] {
  return candidates.map((c, i) => ({ id: c.id, score: 1 - c.distance - i * 0.001 }));
}
