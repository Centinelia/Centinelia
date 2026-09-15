/**
 * Sentiment classifier for IG comments/DMs.
 *
 * Fast path: crisis regex fires WITHOUT an LLM call (cheap + instant).
 * Slow path: Anthropic Haiku with cached system prompt for positive/neutral/negative.
 *
 * Spec Section 7.1.
 */
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';

export type SentimentLabel = 'positive' | 'neutral' | 'negative' | 'crisis';

// ─── Crisis fast path ─────────────────────────────────────────────────────────
// Fires before LLM to keep cost = 0 for urgent escalations.

const CRISIS_RE =
  /demanda|abogado|reembolso|denuncia|fraude|estafa|profeco|condusef|mala experiencia|nunca vuelvo|es una vergüenza/i;

// ─── LLM slow path ────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';

// Stable text → marked ephemeral so the first call caches it and subsequent
// calls hit the cache (cheap reads).
const SYSTEM_PROMPT_TEXT = `Clasifica el sentimiento del siguiente texto en UNA de estas categorías:
- positive: agradecimiento, elogio, pregunta amistosa, satisfacción
- neutral: pregunta neutra, comentario descriptivo, solicitud de información
- negative: queja, molestia, crítica, insatisfacción que NO implica acción legal
- crisis: amenaza legal, mención de fraude, escalada urgente (demanda, profeco, estafa, etc.)

Responde ÚNICAMENTE con la palabra de la categoría, en minúsculas, sin puntuación.`;

// Module-level client reused across calls.
const _anthropic = new Anthropic();

export interface SentimentCtx {
  portalEmail?: string | null;
  agentId?: string | null;
}

/**
 * Classifies the sentiment of a social media comment or DM.
 *
 * @param text  The raw text to classify (truncated at 500 chars before LLM).
 * @param ctx   Optional context for cost attribution in llm_call_log.
 * @param _clientOverride  Injected Anthropic client (tests only).
 */
export async function classifySentiment(
  text: string,
  ctx?: SentimentCtx,
  _clientOverride?: Pick<Anthropic, 'messages'>,
): Promise<SentimentLabel> {
  // ── Fast path: crisis regex ──────────────────────────────────────────────
  if (CRISIS_RE.test(text)) {
    return 'crisis';
  }

  // ── Slow path: LLM ──────────────────────────────────────────────────────
  const client = _clientOverride ?? _anthropic;
  const t0 = Date.now();

  let resp: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 10,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT_TEXT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: text.slice(0, 500) }],
    });
  } catch (err) {
    void logLlmCall({
      source: 'social_sentiment',
      model: MODEL,
      usage: { input_tokens: 0, output_tokens: 0 },
      latencyMs: Date.now() - t0,
      agentId: ctx?.agentId ?? null,
      portalEmail: ctx?.portalEmail ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail-safe: unknown → neutral (won't auto-publish, goes to pending)
    return 'neutral';
  }

  void logLlmCall({
    source: 'social_sentiment',
    model: MODEL,
    usage: resp.usage,
    latencyMs: Date.now() - t0,
    agentId: ctx?.agentId ?? null,
    portalEmail: ctx?.portalEmail ?? null,
  });

  const raw = (resp.content[0]?.type === 'text' ? resp.content[0].text : '')
    .toLowerCase()
    .trim();

  if (raw.startsWith('crisis'))   return 'crisis';
  if (raw.startsWith('negative')) return 'negative';
  if (raw.startsWith('positive')) return 'positive';
  return 'neutral';
}
