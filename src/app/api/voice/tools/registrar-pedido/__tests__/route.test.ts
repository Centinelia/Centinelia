// Regression test para feat/pool-work-based-billing (2026-09-15).
// Valida que registrar_pedido cobra 1 tarea base 'order_registered' SIEMPRE
// que el insert es exitoso, y +1 adicional por WhatsApp si aplica.
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
            data: { business_name: 'Tortillería X', transfer_whatsapp: null },
            error: null,
          })),
        })),
      })),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'order-abc' }, error: null }),
        }),
      }),
    })),
  })),
}));

const consumeAiOpMock = vi.fn(() => Promise.resolve({ ok: true, aiOpsUsed: 1, aiOpsLimit: 1000 }));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: consumeAiOpMock,
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsApp: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/lib/observability/voice-trace', () => ({
  traceVoiceCall: vi.fn(),
}));

async function buildReq(body: unknown, agentId = 'agent-1') {
  return new NextRequest(`http://x/api/voice/tools/registrar-pedido?agent_id=${agentId}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registrar-pedido route (work-based billing)', () => {
  it('cobra 1 tarea base order_registered al insertar pedido exitosamente', async () => {
    const { POST } = await import('../route');
    const req = await buildReq({
      nombre: 'Doña Meche', telefono: '8112345678',
      items: '10 kilos tortilla maíz', tipo: 'entrega',
      direccion: 'Av 1', notas: 'sin sal',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const baseCalls = consumeAiOpMock.mock.calls.filter(
      c => (c[2] as any)?.source === 'order_registered',
    );
    expect(baseCalls.length).toBe(1);
    expect(baseCalls[0][1]).toBe(1);
    expect((baseCalls[0][2] as any).reference_id).toBe('order-abc');
  });

  it('NO cobra whatsapp_notify_owner si transfer_whatsapp es null', async () => {
    const { POST } = await import('../route');
    const req = await buildReq({
      nombre: 'X', telefono: '8112345678', items: '5kg', tipo: 'recoger',
    });
    await POST(req);
    const sources = consumeAiOpMock.mock.calls.map(c => (c[2] as any)?.source);
    expect(sources).toContain('order_registered');
    expect(sources).not.toContain('whatsapp_notify_owner');
  });

  it('devuelve 401 sin auth Vapi y no cobra', async () => {
    const { requireVapiAuth } = await import('@/lib/vapi/auth');
    (requireVapiAuth as any).mockReturnValueOnce(false);
    const { POST } = await import('../route');
    const req = await buildReq({ items: 'x' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(consumeAiOpMock.mock.calls).toHaveLength(0);
  });

  it('sin agent_id devuelve mensaje error, no cobra', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/registrar-pedido', {
      method: 'POST',
      body: JSON.stringify({ items: 'x' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.result).toMatch(/configuración/i);
    expect(consumeAiOpMock.mock.calls).toHaveLength(0);
  });
});
