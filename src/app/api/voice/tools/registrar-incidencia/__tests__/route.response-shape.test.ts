// Regression test para custom-LLM response shape (bug 2026-10-01 Rosendo).
// Antes del fix, registrar_incidencia devolvía `{result: msg}` y Vapi en modo
// custom-LLM (Nelia Tortillería desde Sonnet 5.5 rollout 2026-09-28) le pasaba
// "No result returned" al modelo aunque el server hubiera ejecutado la tool
// y mandado los correos. Nelia pensaba que falló y reportaba bug via
// reportar_falla, mientras el cliente ya estaba atendido.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single:      vi.fn(() => Promise.resolve({
            data: table === 'voice_agents'
              ? { id: 'agent-1', portal_email: 'x@x.mx', business_name: 'Tortillería' }
              : { directory: [] },
            error: null,
          })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}));

vi.mock('@/lib/tools/dedup/with-dedup', () => ({
  withDedup: vi.fn((_ctx: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/lib/tools/executors/registrar-incidencia', () => ({
  registrarIncidencia: vi.fn(() => Promise.resolve({
    ok: true,
    incident_id: 'inc-1',
    email_sent: true,
    verification_at: '2026-10-04T16:41:11.004Z',
  })),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe('registrar-incidencia route (custom-llm response shape)', () => {
  it('envuelve response exitosa en {results:[{toolCallId,result}]} cuando viene toolCallList', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/registrar-incidencia?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          call: { id: 'sess-A' },
          toolCallList: [{
            id: 'call_rinc_1',
            function: {
              arguments: JSON.stringify({
                business_name: 'Mini Súper Ramírez',
                contact_name:  'Rosendo Ramírez',
                contact_phone: '+528144923371',
                address:       'Sierra de Gomas 1020, Guadalupe',
                motivo:        'Vendedor sin visitar hace 3 semanas',
              }),
            },
          }],
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).toHaveProperty('results');
    expect(json.results[0].toolCallId).toBe('call_rinc_1');
    expect(typeof json.results[0].result).toBe('string');
    expect(json.results[0].result).toMatch(/registrad/i);
  });

  it('envuelve guardrail de campos faltantes en {results:[{toolCallId,result}]}', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/registrar-incidencia?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          call: { id: 'sess-B' },
          toolCallList: [{
            id: 'call_rinc_2',
            function: { arguments: '{"business_name":"Solo Nombre"}' },
          }],
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).toHaveProperty('results');
    expect(json.results[0].toolCallId).toBe('call_rinc_2');
    expect(json.results[0].result).toMatch(/faltan campos requeridos/);
  });

  it('cae a formato flat {result} cuando no viene toolCallList (backwards-compat)', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/registrar-incidencia?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({
        business_name: 'Mini Súper Ramírez',
        contact_phone: '+528144923371',
        address:       'Sierra de Gomas 1020',
        motivo:        'Sin vendedor',
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).not.toHaveProperty('results');
    expect(json).toHaveProperty('result');
    expect(typeof json.result).toBe('string');
  });
});
