/**
 * Regresión issues #73, #75: golden_test enviaba `temperature` a Sonnet 5.5+
 * y Anthropic devolvía 400 "temperature is deprecated for this model".
 *
 * Este test verifica que:
 *   1. Con model=claude-sonnet-5-5, el payload NO incluye temperature
 *      (y sí incluye output_config + thinking + max_tokens ≥ 3000)
 *   2. Con model=claude-sonnet-4-6, el payload SÍ incluye temperature
 *   3. Con model=claude-haiku-4-5-*, el payload SÍ incluye temperature
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

vi.mock('@/lib/vapi/resolve-meerkat', () => ({
  resolveMeerkatConfig: vi.fn(),
}));

vi.mock('@/lib/observability/llm-log', () => ({
  logLlmCall: vi.fn(),
}));

vi.mock('../tools', () => ({
  getToolsForMeerkat: () => [],
}));

vi.mock('../prompts/nia-system', () => ({
  NIA_SYSTEM_PROMPT: 'SYSTEM PROMPT NIA',
}));

vi.mock('../prompts/nox-system', () => ({
  NOX_SYSTEM_PROMPT: 'SYSTEM PROMPT NOX',
}));

vi.mock('../prompts/niva-system', () => ({
  NIVA_SYSTEM_PROMPT: 'SYSTEM PROMPT NIVA',
}));

import { invokeMeerkat } from '../meerkat-invoker';
import { resolveMeerkatConfig } from '@/lib/vapi/resolve-meerkat';

const okResponse = {
  content: [{ type: 'text', text: 'hola' }],
  usage: { input_tokens: 10, output_tokens: 5 },
  model: 'anthropic-model',
};

describe('meerkat-invoker temperature guard', () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue(okResponse);
    vi.mocked(resolveMeerkatConfig).mockReset();
  });

  it('NO envía temperature cuando model = claude-sonnet-5-5', async () => {
    vi.mocked(resolveMeerkatConfig).mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      temperature: 0.4,
      maxTokens: 200,
      speed: 1.0,
      minChars: 25,
      voiceModel: 'eleven_turbo_v2_5',
      sttModel: 'nova-3',
    });

    await invokeMeerkat('nia', 6, [{ role: 'user', content: 'hola' }]);

    expect(createMock).toHaveBeenCalledOnce();
    const payload = createMock.mock.calls[0][0];
    expect(payload).not.toHaveProperty('temperature');
    expect(payload.model).toBe('claude-sonnet-5-5');
    expect(payload.max_tokens).toBeGreaterThanOrEqual(3000);
    expect(payload.output_config).toEqual({ effort: 'low' });
    expect(payload.thinking).toEqual({ type: 'between_tools' });
  });

  it('SÍ envía temperature cuando model = claude-sonnet-4-6', async () => {
    vi.mocked(resolveMeerkatConfig).mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      temperature: 0.4,
      maxTokens: 200,
      speed: 1.0,
      minChars: 25,
      voiceModel: 'eleven_turbo_v2_5',
      sttModel: 'nova-3',
    });

    await invokeMeerkat('nia', 5, [{ role: 'user', content: 'hola' }]);

    const payload = createMock.mock.calls[0][0];
    expect(payload).toHaveProperty('temperature', 0.4);
    expect(payload).not.toHaveProperty('output_config');
    expect(payload).not.toHaveProperty('thinking');
    expect(payload.max_tokens).toBe(200);
  });

  it('SÍ envía temperature cuando model = claude-haiku-4-5-20251001', async () => {
    vi.mocked(resolveMeerkatConfig).mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      temperature: 0.35,
      maxTokens: 400,
      speed: 0.91,
      minChars: 25,
      voiceModel: 'eleven_turbo_v2_5',
      sttModel: 'nova-3',
    });

    await invokeMeerkat('nia', 1, [{ role: 'user', content: 'hola' }]);

    const payload = createMock.mock.calls[0][0];
    expect(payload).toHaveProperty('temperature', 0.35);
    expect(payload).not.toHaveProperty('output_config');
    expect(payload.max_tokens).toBe(400);
  });

  it('configOverride.model=Sonnet 5.5 sobre config base 4.6 también aplica guard', async () => {
    vi.mocked(resolveMeerkatConfig).mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      temperature: 0.4,
      maxTokens: 200,
      speed: 1.0,
      minChars: 25,
      voiceModel: 'eleven_turbo_v2_5',
      sttModel: 'nova-3',
    });

    await invokeMeerkat(
      'nia',
      5,
      [{ role: 'user', content: 'hola' }],
      undefined,
      { model: 'claude-sonnet-5-5' },
    );

    const payload = createMock.mock.calls[0][0];
    expect(payload).not.toHaveProperty('temperature');
    expect(payload.model).toBe('claude-sonnet-5-5');
  });
});
