/**
 * Standalone node:test runner for classifySentiment.
 *
 * NOTA: sentiment.ts importa '@anthropic-ai/sdk' y '@/lib/observability/llm-log'
 * con path aliases que jiti no puede resolver sin un tsconfig.paths loader adicional.
 * Por eso este runner INLINEA la logica de classifySentiment — identica al source,
 * pero con el Anthropic client y logLlmCall inyectados como parametros.
 * Si cambias sentiment.ts, actualiza aqui.
 *
 * Uso desde la raiz del worktree:
 *
 *   node \
 *     --import "file:///C:/Users/Nazre/centinelia/node_modules/jiti/lib/jiti-native.mjs" \
 *     src/lib/social/__tests__/run-sentiment-tests.mjs
 *
 * Convencion estandar: centinelia y centinelia-navi estan al mismo nivel
 * (C:/Users/Nazre/). Sobreescribir con CENTINELA_ROOT env var si se necesita.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inlined from sentiment.ts ───────────────────────────────────────────────
// Mirrors the real implementation. Keep in sync with src/lib/social/sentiment.ts.

const CRISIS_RE =
  /demanda|abogado|reembolso|denuncia|fraude|estafa|profeco|condusef|mala experiencia|nunca vuelvo|es una vergüenza/i;

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT_TEXT = `Clasifica el sentimiento del siguiente texto en UNA de estas categorías:
- positive: agradecimiento, elogio, pregunta amistosa, satisfacción
- neutral: pregunta neutra, comentario descriptivo, solicitud de información
- negative: queja, molestia, crítica, insatisfacción que NO implica acción legal
- crisis: amenaza legal, mención de fraude, escalada urgente (demanda, profeco, estafa, etc.)

Responde ÚNICAMENTE con la palabra de la categoría, en minúsculas, sin puntuación.`;

/**
 * Inlined version of classifySentiment with explicit injection of client + logFn.
 * Matches the contract of the real function signature.
 *
 * @param text
 * @param ctx
 * @param _clientOverride   Anthropic client stub (required here — real fn has default)
 * @param _logOverride      logLlmCall stub
 */
async function classifySentiment(text, ctx, _clientOverride, _logOverride) {
  const logLlmCall = _logOverride ?? (() => Promise.resolve());

  // Fast path: crisis regex
  if (CRISIS_RE.test(text)) {
    return 'crisis';
  }

  // Slow path: LLM
  const client = _clientOverride;
  const t0 = Date.now();

  let resp;
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

// ─── Stub helpers ─────────────────────────────────────────────────────────────

function makeClientStub(responseText, shouldThrow = false) {
  let callCount = 0;
  let lastCallArgs = null;
  const stub = {
    messages: {
      create: async (args) => {
        callCount++;
        lastCallArgs = args;
        if (shouldThrow) throw new Error('LLM unavailable');
        return {
          content: [{ type: 'text', text: responseText }],
          usage: { input_tokens: 10, output_tokens: 1 },
        };
      },
    },
    getCallCount: () => callCount,
    getLastArgs: () => lastCallArgs,
  };
  return stub;
}

function makeLogStub() {
  let calls = [];
  const fn = async (opts) => { calls.push(opts); };
  fn.getCalls = () => calls;
  fn.reset = () => { calls = []; };
  return fn;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// 1. Crisis fast path — regex fires WITHOUT calling Anthropic
// ---------------------------------------------------------------------------

describe('classifySentiment — crisis fast path (regex)', () => {
  const crisisTexts = [
    'Voy a poner una demanda por esto',
    'Llamaré a mi abogado',
    'Quiero mi reembolso ahora mismo',
    'Voy a poner una denuncia formal',
    'Esto es un fraude total',
    'Los voy a denunciar por estafa',
    'Reportaré esto a profeco',
    'Voy a avisar a condusef',
    'Tuve una mala experiencia terrible',
    'Nunca vuelvo a comprar aquí',
    'Es una vergüenza lo que hacen',
  ];

  for (const text of crisisTexts) {
    test(`returns 'crisis' for "${text.slice(0, 45)}..." WITHOUT calling Anthropic`, async () => {
      const stub = makeClientStub('positive');
      const result = await classifySentiment(text, undefined, stub, undefined);
      assert.equal(result, 'crisis');
      assert.equal(stub.getCallCount(), 0, 'Anthropic must NOT be called for crisis regex');
    });
  }

  test('is case-insensitive for crisis keywords', async () => {
    const stub = makeClientStub('positive');
    const result = await classifySentiment('DEMANDA Y FRAUDE', undefined, stub, undefined);
    assert.equal(result, 'crisis');
    assert.equal(stub.getCallCount(), 0);
  });

  test('partial keyword match triggers crisis (demanda in longer text)', async () => {
    const stub = makeClientStub('positive');
    const result = await classifySentiment(
      'Si no me resuelven voy a meter una demanda formal ante un juzgado',
      undefined, stub, undefined,
    );
    assert.equal(result, 'crisis');
    assert.equal(stub.getCallCount(), 0);
  });
});

// ---------------------------------------------------------------------------
// 2. LLM slow path — called only when regex misses
// ---------------------------------------------------------------------------

describe('classifySentiment — LLM slow path', () => {
  test('calls Anthropic when regex does not match', async () => {
    const stub = makeClientStub('positive');
    await classifySentiment('Me encanta el servicio', undefined, stub, undefined);
    assert.equal(stub.getCallCount(), 1, 'should call Anthropic exactly once');
  });

  test('uses cache_control ephemeral on system prompt block', async () => {
    const stub = makeClientStub('neutral');
    await classifySentiment('¿Qué horarios tienen?', undefined, stub, undefined);
    const args = stub.getLastArgs();
    assert.ok(Array.isArray(args.system), 'system should be an array');
    assert.ok(args.system.length > 0, 'system should have at least one block');
    const block = args.system[0];
    assert.deepEqual(block.cache_control, { type: 'ephemeral' },
      `expected cache_control={type:'ephemeral'}, got ${JSON.stringify(block.cache_control)}`);
  });

  test('system prompt block is type=text', async () => {
    const stub = makeClientStub('neutral');
    await classifySentiment('hola', undefined, stub, undefined);
    const args = stub.getLastArgs();
    assert.equal(args.system[0].type, 'text');
  });

  test('sends model = claude-haiku-4-5-20251001', async () => {
    const stub = makeClientStub('positive');
    await classifySentiment('texto', undefined, stub, undefined);
    assert.equal(stub.getLastArgs().model, 'claude-haiku-4-5-20251001');
  });

  test('truncates text to 500 chars before LLM', async () => {
    const stub = makeClientStub('neutral');
    const longText = 'a'.repeat(1000);
    await classifySentiment(longText, undefined, stub, undefined);
    const userContent = stub.getLastArgs().messages[0].content;
    assert.ok(userContent.length <= 500, `text was not truncated: length=${userContent.length}`);
  });

  test('calls logLlmCall with correct source and model on success', async () => {
    const stub = makeClientStub('negative');
    const log = makeLogStub();
    await classifySentiment('El servicio fue muy malo.', undefined, stub, log);
    assert.equal(log.getCalls().length, 1);
    const logged = log.getCalls()[0];
    assert.equal(logged.source, 'social_sentiment');
    assert.ok(logged.model.includes('haiku'), `expected haiku model, got ${logged.model}`);
    assert.ok(logged.usage, 'usage should be present');
    assert.equal(logged.error, undefined);
  });

  test('calls logLlmCall with error info when LLM throws', async () => {
    const stub = makeClientStub('', true);
    const log = makeLogStub();
    const result = await classifySentiment('texto normal', undefined, stub, log);
    assert.equal(result, 'neutral', 'should fall back to neutral on error');
    assert.equal(log.getCalls().length, 1);
    const logged = log.getCalls()[0];
    assert.ok(logged.error, `expected error field, got: ${logged.error}`);
    assert.equal(logged.usage.input_tokens, 0);
    assert.equal(logged.usage.output_tokens, 0);
  });

  test('passes portalEmail and agentId to logLlmCall', async () => {
    const stub = makeClientStub('positive');
    const log = makeLogStub();
    await classifySentiment('buen día', { portalEmail: 'org@test.mx', agentId: 'agent-123' }, stub, log);
    const logged = log.getCalls()[0];
    assert.equal(logged.portalEmail, 'org@test.mx');
    assert.equal(logged.agentId, 'agent-123');
  });
});

// ---------------------------------------------------------------------------
// 3. Label mapping from LLM output
// ---------------------------------------------------------------------------

describe('classifySentiment — LLM output mapping', () => {
  const cases = [
    { llmOutput: 'positive',  expected: 'positive' },
    { llmOutput: 'negative',  expected: 'negative' },
    { llmOutput: 'neutral',   expected: 'neutral'  },
    { llmOutput: 'crisis',    expected: 'crisis'   },
    { llmOutput: 'no sé',     expected: 'neutral'  }, // unknown → fallback neutral
    { llmOutput: '',          expected: 'neutral'  }, // empty → fallback neutral
    // LLM might include trailing whitespace or capitalization
    { llmOutput: 'Positive\n', expected: 'positive' },
    { llmOutput: 'NEGATIVE',   expected: 'negative' },
  ];

  for (const { llmOutput, expected } of cases) {
    test(`LLM returns "${llmOutput}" → classifySentiment returns '${expected}'`, async () => {
      const stub = makeClientStub(llmOutput);
      const result = await classifySentiment('texto sin crisis keywords', undefined, stub, undefined);
      assert.equal(result, expected, `LLM output "${llmOutput}" should map to "${expected}"`);
    });
  }
});
