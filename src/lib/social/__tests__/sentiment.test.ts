/**
 * Unit tests for classifySentiment.
 *
 * Key guarantees verified:
 *   - Crisis regex fires WITHOUT calling Anthropic
 *   - LLM path is called when regex misses
 *   - cache_control ephemeral is present on the system prompt block
 *   - logLlmCall is invoked on every Anthropic call
 *   - LLM output is mapped correctly to the 4 labels
 *   - Fallback to 'neutral' on LLM error
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifySentiment } from '../sentiment';
import * as llmLogModule from '@/lib/observability/llm-log';

// ─── Minimal Anthropic client stub ───────────────────────────────────────────

function makeAnthropicStub(responseText: string, shouldThrow = false) {
  return {
    messages: {
      create: vi.fn(async () => {
        if (shouldThrow) throw new Error('LLM unavailable');
        return {
          content: [{ type: 'text', text: responseText }],
          usage: { input_tokens: 10, output_tokens: 1 },
        };
      }),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('classifySentiment — crisis fast path (regex)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const crisisTexts = [
    'Voy a poner una demanda',
    'Llamaré a mi abogado',
    'Quiero mi reembolso ahora',
    'Voy a poner una denuncia',
    'Esto es un fraude',
    'Los voy a denunciar por estafa',
    'Reportaré esto a profeco',
    'Voy a avisar a condusef',
    'Tuve una mala experiencia terrible',
    'Nunca vuelvo a comprar aquí',
    'Es una vergüenza lo que hacen',
  ];

  for (const text of crisisTexts) {
    it(`returns 'crisis' for "${text.slice(0, 40)}..." WITHOUT calling Anthropic`, async () => {
      const stub = makeAnthropicStub('positive');
      const result = await classifySentiment(text, undefined, stub as never);
      expect(result).toBe('crisis');
      // LLM must NOT be called
      expect(stub.messages.create).not.toHaveBeenCalled();
    });
  }

  it('is case-insensitive for crisis keywords', async () => {
    const stub = makeAnthropicStub('positive');
    const result = await classifySentiment('DEMANDA Y FRAUDE', undefined, stub as never);
    expect(result).toBe('crisis');
    expect(stub.messages.create).not.toHaveBeenCalled();
  });
});

describe('classifySentiment — LLM slow path', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls Anthropic when regex does not match', async () => {
    const stub = makeAnthropicStub('positive');
    await classifySentiment('Me encanta el servicio!', undefined, stub as never);
    expect(stub.messages.create).toHaveBeenCalledOnce();
  });

  it('uses cache_control ephemeral on system prompt block', async () => {
    const stub = makeAnthropicStub('neutral');
    await classifySentiment('¿Qué horarios tienen?', undefined, stub as never);
    const [callArgs] = stub.messages.create.mock.calls;
    const systemBlocks: unknown[] = callArgs[0].system;
    expect(systemBlocks).toBeDefined();
    expect(systemBlocks.length).toBeGreaterThan(0);
    const first = systemBlocks[0] as { type: string; cache_control: { type: string } };
    expect(first.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('calls logLlmCall on successful LLM invocation', async () => {
    const logSpy = vi.spyOn(llmLogModule, 'logLlmCall').mockResolvedValue(undefined);
    const stub = makeAnthropicStub('negative');
    await classifySentiment('El servicio fue muy malo.', undefined, stub as never);
    expect(logSpy).toHaveBeenCalledOnce();
    const [opts] = logSpy.mock.calls[0];
    expect(opts.source).toBe('social_sentiment');
    expect(opts.model).toContain('haiku');
    expect(opts.usage).toBeDefined();
  });

  it('calls logLlmCall with error info when LLM throws', async () => {
    const logSpy = vi.spyOn(llmLogModule, 'logLlmCall').mockResolvedValue(undefined);
    const stub = makeAnthropicStub('', true);
    const result = await classifySentiment('texto normal', undefined, stub as never);
    expect(result).toBe('neutral'); // fail-safe
    expect(logSpy).toHaveBeenCalledOnce();
    const [opts] = logSpy.mock.calls[0];
    expect(opts.error).toBeTruthy();
  });

  it('maps LLM text "positive" → positive', async () => {
    const stub = makeAnthropicStub('positive');
    expect(await classifySentiment('Excelente atención', undefined, stub as never)).toBe('positive');
  });

  it('maps LLM text "negative" → negative', async () => {
    const stub = makeAnthropicStub('negative');
    expect(await classifySentiment('El servicio fue malo', undefined, stub as never)).toBe('negative');
  });

  it('maps LLM text "neutral" → neutral', async () => {
    const stub = makeAnthropicStub('neutral');
    expect(await classifySentiment('¿Abren los domingos?', undefined, stub as never)).toBe('neutral');
  });

  it('maps LLM text "crisis" → crisis (double-safety)', async () => {
    const stub = makeAnthropicStub('crisis');
    expect(await classifySentiment('texto sin keywords de crisis', undefined, stub as never)).toBe('crisis');
  });

  it('falls back to neutral on unknown LLM output', async () => {
    const stub = makeAnthropicStub('no sé');
    expect(await classifySentiment('texto raro', undefined, stub as never)).toBe('neutral');
  });

  it('passes portalEmail and agentId to logLlmCall', async () => {
    const logSpy = vi.spyOn(llmLogModule, 'logLlmCall').mockResolvedValue(undefined);
    const stub = makeAnthropicStub('positive');
    await classifySentiment('buen día', { portalEmail: 'org@test.mx', agentId: 'agent-123' }, stub as never);
    const [opts] = logSpy.mock.calls[0];
    expect(opts.portalEmail).toBe('org@test.mx');
    expect(opts.agentId).toBe('agent-123');
  });

  it('truncates text to 500 chars before LLM', async () => {
    const stub = makeAnthropicStub('neutral');
    const longText = 'a'.repeat(1000);
    await classifySentiment(longText, undefined, stub as never);
    const [callArgs] = stub.messages.create.mock.calls;
    const userMessage = callArgs[0].messages[0].content;
    expect((userMessage as string).length).toBeLessThanOrEqual(500);
  });
});
