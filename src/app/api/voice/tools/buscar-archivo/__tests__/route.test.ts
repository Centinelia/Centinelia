// Regression test para migración a helper `toolResponse` (2026-09-27).
// Antes: devolvía `{ result }` flat → con custom-llm Vapi respondía "No result returned".
// Ahora: envuelve en `{ results: [{ toolCallId, result }] }` cuando viene toolCallId.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/vapi/auth', () => ({
  requireVapiAuth: vi.fn(() => true),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/services/connector-tools', () => ({
  executeSearchFiles: vi.fn(() => Promise.resolve({
    ok: true,
    files: [{ id: 'f-1', name: 'contrato.pdf' }],
  })),
}));

vi.mock('@/lib/observability/voice-trace', () => ({
  traceVoiceCall: vi.fn(),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe('buscar-archivo route (custom-llm response shape)', () => {
  it('envuelve response en {results:[{toolCallId,result}]} cuando viene toolCallList', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/buscar-archivo?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          call: { id: 'sess-A' },
          toolCallList: [{ id: 'call_ba_1', function: { arguments: '{"busqueda":"contrato"}' } }],
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).toHaveProperty('results');
    expect(json.results).toHaveLength(1);
    expect(json.results[0].toolCallId).toBe('call_ba_1');
    expect(json.results[0].result).toMatch(/contrato\.pdf/);
  });

  it('cae a formato flat cuando no viene toolCallList (backwards-compat)', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/buscar-archivo?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({ busqueda: 'contrato' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).not.toHaveProperty('results');
    expect(json).toHaveProperty('result');
    expect(json.result).toMatch(/contrato\.pdf/);
  });
});
