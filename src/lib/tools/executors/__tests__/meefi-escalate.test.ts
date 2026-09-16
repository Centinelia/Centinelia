// src/lib/tools/executors/__tests__/meefi-escalate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del helper canónico. Firma real:
//   sendMeerkatHtmlEmail(input: SendAsAgentInput, supabase, precomputed?) => Promise<SendAsAgentResult>
vi.mock('@/lib/email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: vi.fn().mockResolvedValue({ ok: true, provider: 'resend' }),
}));

// Mock de createAdminClient para evitar llamadas reales en tests.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));

// Mock consumeAiOp para verificar cobros al pool sin tocar Supabase real.
// vi.hoisted expone variables al scope hoisted junto con vi.mock.
const { consumeAiOpMock } = vi.hoisted(() => ({
  consumeAiOpMock: vi.fn(() => Promise.resolve({ ok: true, used: 1, limit: 100 })),
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: consumeAiOpMock,
}));

import { executeMeefiEscalateToHuman } from '../meefi-escalate-to-human';
import { sendMeerkatHtmlEmail } from '@/lib/email/send-as-agent';

beforeEach(() => {
  vi.clearAllMocks();
  (sendMeerkatHtmlEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, provider: 'resend' });
});

describe('meefi-escalate-to-human', () => {
  it('rutea transferencia_urgente a emilio alias', async () => {
    const r = await executeMeefiEscalateToHuman(
      { agent_id: 'nelia_meefi' } as any,
      {
        topic:           'transferencia_urgente',
        priority:        'alta',
        context_summary: 'Usuario reporta transferencia $50k retenida',
        user_id:         'usr_003',
        transcript:      'demo transcript',
      },
    );
    expect(r.ok).toBe(true);
    expect(r.sent_to).toBe('nazre20+emilio@gmail.com');
    expect(r.routed_to_name).toBe('Emilio (Operaciones)');
    expect(r.ticket_id).toMatch(/^esc_/);
  });

  it('rutea cuentas_docs a ashley alias', async () => {
    const r = await executeMeefiEscalateToHuman(
      {} as any,
      {
        topic:           'cuentas_docs',
        priority:        'media',
        context_summary: 'x',
        user_id:         'usr_001',
      },
    );
    expect(r.ok).toBe(true);
    expect(r.sent_to).toBe('nazre20+ashley@gmail.com');
    expect(r.routed_to_name).toBe('Ashley (Cuentas)');
    expect(r.ticket_id).toMatch(/^esc_/);
  });

  it('rutea recovery_2fa a ashley', async () => {
    const r = await executeMeefiEscalateToHuman(
      {} as any,
      {
        topic:           'recovery_2fa',
        priority:        'media',
        context_summary: 'x',
        user_id:         'usr_002',
      },
    );
    expect(r.ok).toBe(true);
    expect(r.sent_to).toBe('nazre20+ashley@gmail.com');
    expect(r.routed_to_name).toBe('Ashley (Cuentas)');
  });
});

// Regression test 2026-09-15 — Meefi Soporte estaba enviando escalamientos
// sin cobrar al pool. Nash drift detector lo flagueaba horario. Ver
// [[feedback-pool-accuracy-top-priority]].
describe('meefi-escalate-to-human — cobro al pool', () => {
  it('cobra 1 tarea base meefi_escalation + 1 meefi_escalation_notif al enviar', async () => {
    await executeMeefiEscalateToHuman(
      { agent: { id: 'agent-nelia-meefi' } } as any,
      {
        topic:           'transferencia_urgente',
        priority:        'alta',
        context_summary: 'x',
        user_id:         'usr_003',
      },
    );

    expect(consumeAiOpMock).toHaveBeenCalledTimes(2);
    expect(consumeAiOpMock).toHaveBeenNthCalledWith(1,
      'agent-nelia-meefi', 1, expect.objectContaining({ source: 'meefi_escalation' }),
    );
    expect(consumeAiOpMock).toHaveBeenNthCalledWith(2,
      'agent-nelia-meefi', 1, expect.objectContaining({ source: 'meefi_escalation_notif' }),
    );
  });

  it('cobra base pero NO notif si el envío falla', async () => {
    (sendMeerkatHtmlEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, provider: 'resend', error: 'boom' });
    await executeMeefiEscalateToHuman(
      { agent: { id: 'agent-nelia-meefi' } } as any,
      { topic: 'otro', priority: 'baja', context_summary: 'x', user_id: 'usr_x' },
    );
    expect(consumeAiOpMock).toHaveBeenCalledTimes(1);
    expect(consumeAiOpMock).toHaveBeenCalledWith(
      'agent-nelia-meefi', 1, expect.objectContaining({ source: 'meefi_escalation' }),
    );
  });

  it('sin ctx.agent.id no intenta cobrar (defensivo, ej: tests o invocación directa)', async () => {
    await executeMeefiEscalateToHuman(
      {} as any,
      { topic: 'otro', priority: 'baja', context_summary: 'x', user_id: 'usr_x' },
    );
    // MEEFI_NELIA_AGENT_ID env var podría estar seteado; si no lo está, no debe cobrar.
    // El test es defensivo: si está seteado en CI, ambos cobros existen.
    const calls = consumeAiOpMock.mock.calls.length;
    if (!process.env.MEEFI_NELIA_AGENT_ID) expect(calls).toBe(0);
  });
});
