// Regression test para migración a helper `toolResponse` (2026-09-27).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single:      vi.fn(() => Promise.resolve({ data: table === 'voice_agents' ? { id: 'agent-1', portal_email: 'x@x.mx' } : { directory: [] }, error: null })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}));

vi.mock('@/lib/tools/executors/registrar-cliente-nuevo', () => ({
  registrarClienteNuevo: vi.fn(() => Promise.resolve({ email_sent: true, cliente_id: 'c-1' })),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe('registrar-cliente-nuevo route (custom-llm response shape)', () => {
  it('envuelve response en {results:[{toolCallId,result}]} cuando viene toolCallList', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/registrar-cliente-nuevo?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          call: { id: 'sess-A' },
          toolCallList: [{
            id: 'call_rcn_1',
            function: {
              arguments: JSON.stringify({ business_name: 'Café Nuevo', contact_phone: '+528111', address: 'Av 123' }),
            },
          }],
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).toHaveProperty('results');
    expect(json.results[0].toolCallId).toBe('call_rcn_1');
    expect(json.results[0].result).toMatch(/di de alta al cliente/i);
  });

  it('cae a formato flat cuando no viene toolCallList', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/registrar-cliente-nuevo?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({ business_name: 'Café Nuevo', contact_phone: '+528111', address: 'Av 123' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).not.toHaveProperty('results');
    expect(json).toHaveProperty('result');
  });

  it('bloquea con guardrail cuando faltan campos requeridos y devuelve shape correcto', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/registrar-cliente-nuevo?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          call: { id: 'sess-B' },
          toolCallList: [{ id: 'call_rcn_2', function: { arguments: '{"business_name":"Solo Nombre"}' } }],
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.results[0].toolCallId).toBe('call_rcn_2');
    expect(json.results[0].result).toMatch(/faltan campos requeridos/);
  });
});
