// Regression test para feat/pool-work-based-billing (2026-09-15).
// crear_lead cobra 1 tarea 'lead_registered' SOLO si upsert.action === 'created'.
// Updates de un lead reciente (dedup <10min) NO cobran base — el meerkat no
// hizo trabajo nuevo, solo refrescó datos.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/vapi/auth', () => ({
  requireVapiAuth: vi.fn(() => true),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { business_name: 'X', transfer_whatsapp: null, portal_email: 'x@x.mx' },
            error: null,
          })),
        })),
      })),
    })),
  })),
}));

const upsertMock = vi.fn();
vi.mock('@/lib/leads/dedup', () => ({
  upsertLeadWithDedup: (...args: unknown[]) => upsertMock(...args),
}));

type ConsumeAiOpArgs = [agentId: string, count: number, meta?: { source?: string; label?: string; reference_id?: string }];
const consumeAiOpMock = vi.fn<(...args: ConsumeAiOpArgs) => Promise<{ ok: boolean; aiOpsUsed: number; aiOpsLimit: number }>>(
  () => Promise.resolve({ ok: true, aiOpsUsed: 1, aiOpsLimit: 1000 }),
);
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: consumeAiOpMock,
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsApp: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/lib/services/sheets', () => ({
  syncLeadToSheets: vi.fn(),
}));

vi.mock('@/lib/observability/voice-trace', () => ({
  traceVoiceCall: vi.fn(),
}));

async function buildReq(body: unknown, agentId = 'agent-1') {
  return new NextRequest(`http://x/api/voice/tools/crear-lead?agent_id=${agentId}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('crear-lead route (work-based billing)', () => {
  it('cobra lead_registered cuando upsert.action === created', async () => {
    upsertMock.mockResolvedValueOnce({ action: 'created', id: 'lead-new-1' });
    const { POST } = await import('../route');
    const req = await buildReq({
      nombre: 'Ana', negocio: 'Café XX', servicio: 'cotización mensual',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const baseCalls = consumeAiOpMock.mock.calls.filter(
      c => c[2]?.source === 'lead_registered',
    );
    expect(baseCalls.length).toBe(1);
    expect(baseCalls[0][1]).toBe(1);
    expect(baseCalls[0][2]?.reference_id).toBe('lead-new-1');
  });

  it('NO cobra lead_registered cuando upsert.action === updated (dedup)', async () => {
    upsertMock.mockResolvedValueOnce({ action: 'updated', id: 'lead-existing-1' });
    const { POST } = await import('../route');
    const req = await buildReq({ nombre: 'Ana', negocio: 'Café XX' });
    await POST(req);
    const sources = consumeAiOpMock.mock.calls.map(c => c[2]?.source);
    expect(sources).not.toContain('lead_registered');
  });

  it('devuelve 401 sin auth Vapi y no cobra', async () => {
    const { requireVapiAuth } = await import('@/lib/vapi/auth');
    (requireVapiAuth as unknown as { mockReturnValueOnce: (v: boolean) => void }).mockReturnValueOnce(false);
    const { POST } = await import('../route');
    const req = await buildReq({ nombre: 'x' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(consumeAiOpMock.mock.calls).toHaveLength(0);
  });

  it('envuelve response en {results:[{toolCallId,result}]} cuando Vapi manda toolCallList (custom-llm)', async () => {
    upsertMock.mockResolvedValueOnce({ action: 'created', id: 'lead-2' });
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/crear-lead?agent_id=agent-1', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          call: { id: 'sess-A', customer: { number: '+528111' } },
          toolCallList: [{ id: 'call_wrap_1', function: { arguments: '{"nombre":"Ana"}' } }],
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json).toEqual({
      results: [{
        toolCallId: 'call_wrap_1',
        result:     'Lead registrado correctamente. Le haremos llegar información pronto.',
      }],
    });
  });

  it('cae a formato flat cuando no viene toolCallList (backwards-compat con Haiku direct)', async () => {
    upsertMock.mockResolvedValueOnce({ action: 'created', id: 'lead-3' });
    const { POST } = await import('../route');
    const req = await buildReq({ nombre: 'Legacy' });
    const res = await POST(req);
    const json = await res.json();
    expect(json).toEqual({
      result: 'Lead registrado correctamente. Le haremos llegar información pronto.',
    });
  });
});
