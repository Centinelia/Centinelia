// Regression test para feat/pool-work-based-billing (2026-09-15).
// crear_ticket cobra 1 tarea base 'ticket_registered' con folio como
// reference_id, aunque no dispare notif email/WA.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/vapi/auth', () => ({
  requireVapiAuth: vi.fn(() => true),
}));

vi.mock('@/lib/helpdesk/folio', () => ({
  getNextTicketFolio: vi.fn(() => Promise.resolve('TCK-000123')),
  getCurrentOnCall: vi.fn(() => null),
}));

vi.mock('@/lib/portal/directory', () => ({
  loadOrgDirectory: vi.fn(() => Promise.resolve([])),
  getHelpdeskExperts: vi.fn(() => []),
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/lib/ops/approval-email', () => ({
  ticketEmailHtml: vi.fn(() => '<html/>'),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    const chain: any = {
      from: vi.fn(() => chain),
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      single: vi.fn(() => Promise.resolve({
        data: {
          transfer_whatsapp: null, wa_phone_number: null, timezone: 'America/Monterrey',
          portal_email: 'x@x.mx', client_email: null, portal_token: null, agent_name: 'Nia',
        },
        error: null,
      })),
    };
    return chain;
  }),
}));

const consumeAiOpMock = vi.fn(() => Promise.resolve({ ok: true, aiOpsUsed: 1, aiOpsLimit: 1000 }));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: consumeAiOpMock,
}));

vi.mock('@/lib/observability/voice-trace', () => ({
  traceVoiceCall: vi.fn(),
}));

async function buildReq(body: unknown, agentId = 'agent-1') {
  return new NextRequest(`http://x/api/voice/tools/crear-ticket?agent_id=${agentId}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('crear-ticket route (work-based billing)', () => {
  it('cobra 1 tarea base ticket_registered con folio como reference_id', async () => {
    const { POST } = await import('../route');
    const req = await buildReq({
      titulo: 'Fuga en cocina', categoria: 'plomeria', prioridad: 'normal',
      descripcion: 'agua saliendo debajo del fregadero',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const baseCalls = consumeAiOpMock.mock.calls.filter(
      c => (c[2] as any)?.source === 'ticket_registered',
    );
    expect(baseCalls.length).toBe(1);
    expect(baseCalls[0][1]).toBe(1);
    expect((baseCalls[0][2] as any).reference_id).toBe('TCK-000123');
  });

  it('devuelve mensaje error si falta título, no cobra', async () => {
    const { POST } = await import('../route');
    const req = await buildReq({ prioridad: 'alta' });
    await POST(req);
    expect(consumeAiOpMock.mock.calls).toHaveLength(0);
  });

  it('devuelve 401 sin auth Vapi y no cobra', async () => {
    const { requireVapiAuth } = await import('@/lib/vapi/auth');
    (requireVapiAuth as any).mockReturnValueOnce(false);
    const { POST } = await import('../route');
    const req = await buildReq({ titulo: 'x' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(consumeAiOpMock.mock.calls).toHaveLength(0);
  });

  // Regression 2026-10-01: ticket_registered, ticket_whatsapp_notify y
  // ticket_email_notify usaban todos reference_id=folio → UNIQUE constraint
  // ops_ledger_portal_ref_kind_uniq rechazaba el 2do+ cobro → undercharge.
  // Fix: notifs usan `${folio}:whatsapp` o `${folio}:email`.
  it('cobros de notif (WA/email) usan reference_id con sufijo distinto al base', async () => {
    // Config con client_email y portal_token para disparar el path email
    const { createAdminClient } = await import('@/lib/supabase/admin');
    (createAdminClient as any).mockReturnValueOnce({
      from:   vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({
        data: {
          transfer_whatsapp: null, wa_phone_number: null, timezone: 'America/Monterrey',
          portal_email: 'x@x.mx', client_email: 'dueno@x.mx', portal_token: 'tok-abc', agent_name: 'Nia',
        },
        error: null,
      }),
    });
    const { POST } = await import('../route');
    const req = await buildReq({
      titulo: 'Fuga', categoria: 'plomeria', prioridad: 'normal',
    });
    await POST(req);

    // Esperar al microtask del .then() del email send
    await new Promise(r => setImmediate(r));

    const baseCall  = consumeAiOpMock.mock.calls.find(c => (c[2] as any)?.source === 'ticket_registered');
    const emailCall = consumeAiOpMock.mock.calls.find(c => (c[2] as any)?.source === 'ticket_email_notify');
    expect(baseCall).toBeTruthy();
    expect((baseCall![2] as any).reference_id).toBe('TCK-000123');
    if (emailCall) {
      expect((emailCall[2] as any).reference_id).toBe('TCK-000123:email');
    }
  });
});
