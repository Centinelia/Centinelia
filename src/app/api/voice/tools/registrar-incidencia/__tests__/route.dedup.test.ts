import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRegistrarIncidencia, mockWithDedup } = vi.hoisted(() => ({
  mockRegistrarIncidencia: vi.fn(),
  mockWithDedup:           vi.fn(),
}));

vi.mock('@/lib/tools/executors/registrar-incidencia', () => ({
  registrarIncidencia: mockRegistrarIncidencia,
}));
vi.mock('@/lib/tools/dedup/with-dedup', () => ({
  withDedup: mockWithDedup,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single:      async () => ({ data: { id: 'a', portal_email: 'p@x.mx' } }),
          maybeSingle: async () => ({ data: null }),
        }),
      }),
      insert: async () => ({ data: null, error: null }),
    }),
  }),
}));

beforeEach(() => {
  mockRegistrarIncidencia.mockReset();
  mockWithDedup.mockReset();
});

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/voice/tools/registrar-incidencia?agent_id=a', {
    method: 'POST',
    body:   JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('registrar_incidencia route — dedup wrap', () => {
  it('llama a withDedup con toolName, agentId y args', async () => {
    mockWithDedup.mockImplementation(async (_ctx: unknown, handler: () => Promise<unknown>) => handler());
    mockRegistrarIncidencia.mockResolvedValue({
      ok: true, incident_id: 'inc-1', email_sent: true, verification_at: '2026-10-02T00:00:00Z',
    });

    const { POST } = await import('../route');
    await POST(makeReq({
      message: {
        toolCallList: [{
          id:       'call_a',
          function: { name: 'registrar_incidencia', arguments: {
            business_name: 'Tecate', contact_phone: '8129262462',
            address: 'Y', motivo: 'M',
          }},
        }],
      },
    }));

    expect(mockWithDedup).toHaveBeenCalledOnce();
    const ctx = mockWithDedup.mock.calls[0][0] as { toolName: string; agentId: string; args: Record<string, unknown>; toolCallId?: string; portalEmail: string; channel: string };
    expect(ctx.toolName).toBe('registrar_incidencia');
    expect(ctx.agentId).toBe('a');
    expect(ctx.portalEmail).toBe('p@x.mx');
    expect(ctx.channel).toBe('voice');
    expect(ctx.args.business_name).toBe('Tecate');
    expect(ctx.toolCallId).toBe('call_a');
  });

  it('regression Tecate: 2 calls back-to-back, wrapper retorna cached el 2do', async () => {
    let cached: unknown = null;
    mockWithDedup.mockImplementation(async (_ctx: unknown, handler: () => Promise<unknown>) => {
      if (cached) return cached;
      cached = await handler();
      return cached;
    });
    mockRegistrarIncidencia.mockResolvedValue({
      ok: true, incident_id: 'inc-1', email_sent: true, verification_at: '2026-10-02T00:00:00Z',
    });

    const { POST } = await import('../route');

    const r1 = await POST(makeReq({
      message: { toolCallList: [{
        id: 'call_a',
        function: { name: 'registrar_incidencia', arguments: {
          business_name: 'Tecate Six', contact_phone: '8129262462',
          address: 'Cruz Potensada 4-54', motivo: 'Ya tiene unos días',
        }},
      }]},
    }));

    const r2 = await POST(makeReq({
      message: { toolCallList: [{
        id: 'call_b',
        function: { name: 'registrar_incidencia', arguments: {
          business_name: 'Tecate Six', contact_phone: '8129262462',
          address: 'Cruz Potensada 4-54', motivo: 'El supervisor vino hace 3 días',
        }},
      }]},
    }));

    expect(mockRegistrarIncidencia).toHaveBeenCalledOnce();
    // El executor solo corre 1 vez (dedup pega el 2do), pero cada response
    // lleva su propio toolCallId (call_a vs call_b) — Vapi necesita match
    // 1:1 entre tool_call y tool_result. Lo invariante es el result text.
    const j1 = await r1.json();
    const j2 = await r2.json();
    expect(j1.results[0].result).toEqual(j2.results[0].result);
    expect(j1.results[0].toolCallId).toBe('call_a');
    expect(j2.results[0].toolCallId).toBe('call_b');
  });
});
