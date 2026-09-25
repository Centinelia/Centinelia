/**
 * Tests unitarios para el reranker de fichas informativas.
 *
 * Cubre:
 *   1. shouldRerank: 3 condiciones de activación.
 *   2. rerankCandidates: respuesta correcta de Haiku.
 *   3. rerankCandidates: fallback cuando Haiku falla.
 *   4. rerankCandidates: fallback cuando JSON es inválido.
 *   5. rerankCandidates: lista vacía.
 *   6. rerankCandidates: menos candidatos que targetK.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted permite que las variables sean accesibles dentro del factory de vi.mock
// (que se hoistea al top del archivo por babel/vitest antes de la ejecución).
const { anthropicState, anthropicMockCreate } = vi.hoisted(() => {
  const anthropicState = {
    responseText: '{"ids": []}' as string,
    shouldThrow: false as boolean,
    inputTokens: 50,
    outputTokens: 20,
  };

  const anthropicMockCreate = vi.fn(async () => {
    if (anthropicState.shouldThrow) throw new Error('Haiku API error');
    return {
      content: [{ type: 'text', text: anthropicState.responseText }],
      usage: {
        input_tokens: anthropicState.inputTokens,
        output_tokens: anthropicState.outputTokens,
      },
    };
  });

  return { anthropicState, anthropicMockCreate };
});

// Mock Anthropic SDK antes de importar rerank
vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic(this: unknown) {
    (this as Record<string, unknown>).messages = { create: anthropicMockCreate };
  }
  MockAnthropic.prototype.messages = { create: anthropicMockCreate };
  return { default: MockAnthropic };
});

// Mock logLlmCall para no escribir a DB
vi.mock('@/lib/observability/llm-log', () => ({
  logLlmCall: vi.fn(async () => {}),
}));

import {
  shouldRerank,
  rerankCandidates,
  _resetClientForTests,
  type RerankCandidate,
} from '@/lib/fichas-informativas/rerank';
import { logLlmCall } from '@/lib/observability/llm-log';

// ─── Candidatos con distancias muy cercanas (delta 0.04 — activa rerank) ──────
const CANDIDATES: RerankCandidate[] = [
  { id: 'c1', content: 'Pago del impuesto predial — requisitos y proceso', titulo: 'Predial',  distance: 0.15 },
  { id: 'c2', content: 'Solicitud de licencia de construcción',             titulo: 'Licencia', distance: 0.16 },
  { id: 'c3', content: 'Registro de vehículo en el padrón municipal',       titulo: 'Vehículo', distance: 0.17 },
  { id: 'c4', content: 'Descuento por pronto pago en impuesto predial',     titulo: 'Predial',  distance: 0.18 },
  { id: 'c5', content: 'Trámites para fraccionadores',                      titulo: 'Frac.',    distance: 0.19 },
];

// ─── Candidatos con distancias dispersas (delta 0.80 — NO activa rerank) ──────
const SPREAD_CANDIDATES: RerankCandidate[] = [
  { id: 'a', content: 'A', distance: 0.10 },
  { id: 'b', content: 'B', distance: 0.30 },
  { id: 'c', content: 'C', distance: 0.50 },
  { id: 'd', content: 'D', distance: 0.70 },
  { id: 'e', content: 'E', distance: 0.90 },
];

// ─── shouldRerank ─────────────────────────────────────────────────────────────

describe('shouldRerank', () => {
  it('returns false when nothing triggers (spread distances, small org)', () => {
    const r = shouldRerank({
      totalFichas: 10,
      candidates: SPREAD_CANDIDATES,
      orgFeatures: {},
    });
    expect(r).toBe(false);
  });

  it('returns true when rerank_enabled feature flag is set', () => {
    const r = shouldRerank({
      totalFichas: 5,
      candidates: SPREAD_CANDIDATES,
      orgFeatures: { rerank_enabled: true },
    });
    expect(r).toBe(true);
  });

  it('returns true when totalFichas > 100', () => {
    const r = shouldRerank({
      totalFichas: 101,
      candidates: SPREAD_CANDIDATES,
      orgFeatures: {},
    });
    expect(r).toBe(true);
  });

  it('returns false when totalFichas = 100 (not strictly greater)', () => {
    const r = shouldRerank({
      totalFichas: 100,
      candidates: SPREAD_CANDIDATES,
      orgFeatures: {},
    });
    expect(r).toBe(false);
  });

  it('returns true when top-5 distance delta < 0.05 (noisy top-K)', () => {
    // delta = 0.24 - 0.20 = 0.04 < 0.05
    const noisyCandidates: RerankCandidate[] = [
      { id: 'a', content: 'A', distance: 0.200 },
      { id: 'b', content: 'B', distance: 0.210 },
      { id: 'c', content: 'C', distance: 0.220 },
      { id: 'd', content: 'D', distance: 0.230 },
      { id: 'e', content: 'E', distance: 0.240 },
    ];
    const r = shouldRerank({ totalFichas: 5, candidates: noisyCandidates, orgFeatures: {} });
    expect(r).toBe(true);
  });

  it('returns false when delta >= 0.05', () => {
    // delta = 0.30 - 0.10 = 0.20 >= 0.05
    const r = shouldRerank({ totalFichas: 5, candidates: SPREAD_CANDIDATES.slice(0, 3), orgFeatures: {} });
    expect(r).toBe(false);
  });
});

// ─── rerankCandidates ────────────────────────────────────────────────────────

describe('rerankCandidates', () => {
  beforeEach(() => {
    anthropicState.responseText = '{"ids": []}';
    anthropicState.shouldThrow = false;
    anthropicState.inputTokens = 50;
    anthropicState.outputTokens = 20;
    anthropicMockCreate.mockClear();
    (logLlmCall as ReturnType<typeof vi.fn>).mockClear();
    // Resetea singleton para que el mock se use en cada test
    _resetClientForTests();
  });

  it('returns empty when candidates is empty', async () => {
    const r = await rerankCandidates({ query: 'test', candidates: [], targetK: 3 });
    expect(r).toEqual([]);
    expect(anthropicMockCreate).not.toHaveBeenCalled();
  });

  it('returns original order when candidates <= targetK (sin llamar Haiku)', async () => {
    const two: RerankCandidate[] = [
      { id: 'x1', content: 'A', distance: 0.1 },
      { id: 'x2', content: 'B', distance: 0.2 },
    ];
    const r = await rerankCandidates({ query: 'test', candidates: two, targetK: 5 });
    expect(r).toHaveLength(2);
    expect(r[0].id).toBe('x1');
    expect(r[1].id).toBe('x2');
    expect(anthropicMockCreate).not.toHaveBeenCalled();
  });

  it('puts chosen ids first with score > 0, rest with score 0', async () => {
    anthropicState.responseText = '{"ids": ["c1", "c4"]}';

    const r = await rerankCandidates({ query: 'predial', candidates: CANDIDATES, targetK: 2 });

    const byId = new Map(r.map((x) => [x.id, x]));
    expect(byId.get('c1')!.score).toBeGreaterThan(0);
    expect(byId.get('c4')!.score).toBeGreaterThan(0);
    expect(byId.get('c2')!.score).toBe(0);
    expect(byId.get('c3')!.score).toBe(0);
    expect(byId.get('c5')!.score).toBe(0);
  });

  it('calls logLlmCall with model claude-haiku-4-5 and usage tokens', async () => {
    anthropicState.responseText = '{"ids": ["c1"]}';
    anthropicState.inputTokens = 123;
    anthropicState.outputTokens = 10;

    await rerankCandidates({ query: 'test', candidates: CANDIDATES, targetK: 1 });

    expect(logLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5',
        usage: expect.objectContaining({ input_tokens: 123, output_tokens: 10 }),
      }),
    );
  });

  it('falls back to original order when Haiku throws (no error propagated)', async () => {
    anthropicState.shouldThrow = true;

    const r = await rerankCandidates({ query: 'test', candidates: CANDIDATES, targetK: 2 });

    // Fallback returns all candidates, no throw
    expect(r).toHaveLength(CANDIDATES.length);
    // Fallback logs error via logLlmCall
    expect(logLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Haiku API error') }),
    );
  });

  it('falls back to original order when JSON response is invalid', async () => {
    anthropicState.responseText = 'No JSON here, just text';

    const r = await rerankCandidates({ query: 'test', candidates: CANDIDATES, targetK: 2 });

    expect(r).toHaveLength(CANDIDATES.length);
    // First candidate should have highest score in fallback
    expect(r[0].id).toBe('c1');
  });

  it('falls back when ids field is missing from JSON', async () => {
    anthropicState.responseText = '{"result": ["c1"]}';

    const r = await rerankCandidates({ query: 'test', candidates: CANDIDATES, targetK: 2 });

    expect(r).toHaveLength(CANDIDATES.length);
  });
});
