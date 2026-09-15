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

const consumeAiOpMock = vi.fn(() => Promise.resolve({ ok: true, aiOpsUsed: 1, aiOpsLimit: 1000 }));
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
      c => (c[2] as any)?.source === 'lead_registered',
    );
    expect(baseCalls.length).toBe(1);
    expect(baseCalls[0][1]).toBe(1);
    expect((baseCalls[0][2] as any).reference_id).toBe('lead-new-1');
  });

  it('NO cobra lead_registered cuando upsert.action === updated (dedup)', async () => {
    upsertMock.mockResolvedValueOnce({ action: 'updated', id: 'lead-existing-1' });
    const { POST } = await import('../route');
    const req = await buildReq({ nombre: 'Ana', negocio: 'Café XX' });
    await POST(req);
    const sources = consumeAiOpMock.mock.calls.map(c => (c[2] as any)?.source);
    expect(sources).not.toContain('lead_registered');
  });

  it('devuelve 401 sin auth Vapi y no cobra', async () => {
    const { requireVapiAuth } = await import('@/lib/vapi/auth');
    (requireVapiAuth as any).mockReturnValueOnce(false);
    const { POST } = await import('../route');
    const req = await buildReq({ nombre: 'x' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(consumeAiOpMock.mock.calls).toHaveLength(0);
  });
});
