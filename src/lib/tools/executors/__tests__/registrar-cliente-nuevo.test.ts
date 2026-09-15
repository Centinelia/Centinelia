// src/lib/tools/executors/__tests__/registrar-cliente-nuevo.test.ts
// Regression test para feat/pool-work-based-billing (2026-09-15): registrar
// cliente nuevo cobra 1 tarea base ADEMÁS de las N tareas por email al encargado.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registrarClienteNuevo } from '../registrar-cliente-nuevo';
import { sendMeerkatHtmlEmail } from '../../../email/send-as-agent';
import { consumeAiOp } from '../../../ai/ops-guard';

vi.mock('../../../email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: vi.fn(() => Promise.resolve({ ok: true, provider: 'resend' })),
}));

vi.mock('../../../ai/ops-guard', () => ({
  consumeAiOp: vi.fn(() => Promise.resolve({ ok: true, aiOpsUsed: 1, aiOpsLimit: 1000 })),
  refundOps:   vi.fn(() => Promise.resolve({ ok: true })),
}));

function makeCtx(overrides: any = {}) {
  const insertedRow = { id: 'inc-2' };
  const priorCandidates = overrides.priorCandidates ?? [];
  const supabase: any = {
    from:   vi.fn(() => supabase),
    insert: vi.fn(() => supabase),
    update: vi.fn(() => supabase),
    select: vi.fn(() => supabase),
    single: vi.fn(() => Promise.resolve({ data: insertedRow, error: null })),
    eq:     vi.fn(function (this: any) { return supabase; }),
    then:   (resolve: any) => resolve({ data: priorCandidates, error: null }),
  };
  return {
    supabase,
    agent: {
      id: 'agent-2', portal_email: 'test@x.mx', agent_name: 'Nia',
      business_name: 'Tortillería X',
      ...overrides,
    },
    org: {
      directory: [
        { id: 'p1', name: 'Encargado Y', phone: '+528100000000',
          email: 'encargado@x.mx', receives_incident_reports: true },
      ],
    },
    channel: 'voice' as const,
    sourceCallId: 'call-2',
  };
}

beforeEach(() => vi.clearAllMocks());

describe('registrarClienteNuevo', () => {
  it('cobra 1 tarea base customer_registered + N tareas por notif email', async () => {
    const ctx = makeCtx();
    const res = await registrarClienteNuevo(ctx as any, {
      business_name: 'Abarrotes Nuevo',
      contact_name:  'Don José',
      contact_phone: '8112345678',
      address:       'Av. 5 Col Z',
    });
    expect(res.ok).toBe(true);
    expect(res.email_sent).toBe(true);
    const calls = (consumeAiOp as any).mock.calls;
    const sources = calls.map((c: any[]) => c[2]?.source);
    expect(sources).toContain('customer_registered');
    expect(sources).toContain('alta_cliente_notif');
    const baseCall = calls.find((c: any[]) => c[2]?.source === 'customer_registered');
    expect(baseCall[1]).toBe(1);
  });

  it('cobra 1 tarea base aunque no haya recipients', async () => {
    const ctx = makeCtx();
    ctx.org.directory = [];
    await registrarClienteNuevo(ctx as any, {
      business_name: 'X', contact_phone: '8112345678', address: 'Y',
    });
    const calls = (consumeAiOp as any).mock.calls;
    const sources = calls.map((c: any[]) => c[2]?.source);
    expect(sources).toContain('customer_registered');
    expect(sources).not.toContain('alta_cliente_notif');
  });

  it('reference_id en el cobro base = incident_id insertado', async () => {
    const ctx = makeCtx();
    await registrarClienteNuevo(ctx as any, {
      business_name: 'Y', contact_phone: '8112345678', address: 'Z',
    });
    const baseCall = (consumeAiOp as any).mock.calls
      .find((c: any[]) => c[2]?.source === 'customer_registered');
    expect(baseCall[2]?.reference_id).toBe('inc-2');
  });
});
