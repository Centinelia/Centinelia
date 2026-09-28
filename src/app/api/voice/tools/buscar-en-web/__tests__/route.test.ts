// Regression test para migración a helper `toolResponse` (2026-09-27).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/vapi/auth', () => ({
  requireVapiAuth: vi.fn(() => true),
}));

vi.mock('@/lib/search/web', () => ({
  searchWeb: vi.fn(() => Promise.resolve([
    { title: 'Resultado 1', description: 'Info relevante', url: 'https://x.com/1' },
  ])),
}));

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock('@/lib/observability/voice-trace', () => ({
  traceVoiceCall: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BRAVE_SEARCH_API_KEY = 'test-key';
});

describe('buscar-en-web route (custom-llm response shape)', () => {
  it('envuelve response en {results:[{toolCallId,result}]} cuando viene toolCallList', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/buscar-en-web?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          call: { id: 'sess-A' },
          toolCallList: [{ id: 'call_bw_1', function: { arguments: '{"query":"clima MTY"}' } }],
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).toHaveProperty('results');
    expect(json.results[0].toolCallId).toBe('call_bw_1');
    expect(json.results[0].result).toMatch(/Resultado 1/);
  });

  it('cae a formato flat cuando no viene toolCallList', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/buscar-en-web?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({ query: 'clima MTY' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).not.toHaveProperty('results');
    expect(json.result).toMatch(/Resultado 1/);
  });
});
