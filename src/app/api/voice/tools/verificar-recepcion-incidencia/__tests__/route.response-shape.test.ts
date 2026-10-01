// Regression test para custom-LLM response shape (preventivo 2026-10-01).
// Mismo bug que registrar_incidencia pero en el tool de verificación 3 días
// después. Nelia Tortillería usará verificar_recepcion_incidencia el 4-oct
// para llamar a Rosendo y confirmar si recibió al vendedor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: table === 'voice_agents'
              ? { id: 'agent-1', portal_email: 'x@x.mx', business_name: 'Tortillería' }
              : { directory: [] },
            error: null,
          })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/tools/executors/verificar-recepcion-incidencia', () => ({
  verificarRecepcionIncidencia: vi.fn(() => Promise.resolve({
    ok: true,
    verification_result: 'ok',
    email_sent: true,
  })),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe('verificar-recepcion-incidencia route (custom-llm response shape)', () => {
  it('envuelve response exitosa en {results:[{toolCallId,result}]} cuando viene toolCallList', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/verificar-recepcion-incidencia?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          call: { id: 'sess-A' },
          toolCallList: [{
            id: 'call_vri_1',
            function: {
              arguments: JSON.stringify({
                incident_id: 'inc-rosendo',
                resultado:  'ok',
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
    expect(json.results[0].toolCallId).toBe('call_vri_1');
    expect(typeof json.results[0].result).toBe('string');
    expect(json.results[0].result).toMatch(/verificación/i);
  });

  it('cae a formato flat {result} cuando no viene toolCallList (backwards-compat)', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/verificar-recepcion-incidencia?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({ incident_id: 'inc-rosendo', resultado: 'ok' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).not.toHaveProperty('results');
    expect(json).toHaveProperty('result');
  });
});
