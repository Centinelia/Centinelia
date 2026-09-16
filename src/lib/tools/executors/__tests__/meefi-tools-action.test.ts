import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock consumeAiOp para verificar cobros al pool sin tocar Supabase real.
// vi.hoisted expone variables al scope hoisted junto con vi.mock.
const { consumeAiOpMock } = vi.hoisted(() => ({
  consumeAiOpMock: vi.fn(() => Promise.resolve({ ok: true, used: 1, limit: 100 })),
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: consumeAiOpMock,
}));

import { executeMeefiSendPasswordResetLink } from '../meefi-send-password-reset-link';
import { executeMeefiInitiate2faRecovery } from '../meefi-initiate-2fa-recovery';
import { executeMeefiCaptureBugReport } from '../meefi-capture-bug-report';

beforeEach(() => {
  consumeAiOpMock.mockClear();
});

describe('meefi-send-password-reset-link', () => {
  it('outcome=account_not_verified si password_reset_locked=true', async () => {
    const r = await executeMeefiSendPasswordResetLink({} as any, { user_id: 'usr_001' });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('account_not_verified');
    if (r.outcome !== 'account_not_verified') return;
    expect(r.suggestion).toContain('verify_email');
  });

  it('outcome=sent + link entregado si cuenta verificada', async () => {
    const r = await executeMeefiSendPasswordResetLink({} as any, { user_id: 'usr_002' });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('sent');
    if (r.outcome !== 'sent') return;
    expect(r.delivered_to).toBe('demo2@meefi.io');
  });
});

describe('meefi-initiate-2fa-recovery', () => {
  it('regresa ticket + checklist evidencia', async () => {
    const r = await executeMeefiInitiate2faRecovery({} as any, { user_id: 'usr_002' });
    expect(r.ok).toBe(true);
    expect(r.recovery_ticket_id).toMatch(/^rec_/);
    expect(r.evidence_checklist).toEqual(
      expect.arrayContaining(['ine_frente', 'ine_reverso', 'selfie_con_ine', 'ultimos_4_cuenta']),
    );
  });
});

describe('meefi-capture-bug-report', () => {
  it('crea ticket con assignee sugerido', async () => {
    const r = await executeMeefiCaptureBugReport({} as any, {
      user_id: 'usr_003',
      description: 'no puedo entrar',
      technical_context: { browser: 'Chrome 128', last_url: '/dashboard' },
    });
    expect(r.ok).toBe(true);
    expect(r.bug_ticket_id).toMatch(/^bug_/);
    expect(['emilio', 'jaime']).toContain(r.assignee_hint);
  });
});

// Regression tests 2026-09-15 — los 3 meefi tools de acción ejecutaban
// side-effects sin cobrar al pool. Fix: consumeAiOp con source dedicado
// cuando ctx.agent.id está disponible. Ver [[feedback-pool-accuracy-top-priority]].
describe('meefi tools — cobro al pool', () => {
  it('password_reset cobra meefi_password_reset solo cuando outcome=sent', async () => {
    // sent → cobra
    await executeMeefiSendPasswordResetLink(
      { agent: { id: 'agent-meefi' } } as any,
      { user_id: 'usr_002' },
    );
    expect(consumeAiOpMock).toHaveBeenCalledOnce();
    expect(consumeAiOpMock).toHaveBeenCalledWith(
      'agent-meefi', 1, expect.objectContaining({ source: 'meefi_password_reset' }),
    );

    // account_not_verified → NO cobra (discovery, no acción)
    consumeAiOpMock.mockClear();
    await executeMeefiSendPasswordResetLink(
      { agent: { id: 'agent-meefi' } } as any,
      { user_id: 'usr_001' },
    );
    expect(consumeAiOpMock).not.toHaveBeenCalled();

    // user_not_found → NO cobra
    consumeAiOpMock.mockClear();
    await executeMeefiSendPasswordResetLink(
      { agent: { id: 'agent-meefi' } } as any,
      { user_id: 'usr_no_existe' },
    );
    expect(consumeAiOpMock).not.toHaveBeenCalled();
  });

  it('initiate_2fa_recovery siempre cobra meefi_2fa_recovery', async () => {
    await executeMeefiInitiate2faRecovery(
      { agent: { id: 'agent-meefi' } } as any,
      { user_id: 'usr_002' },
    );
    expect(consumeAiOpMock).toHaveBeenCalledOnce();
    expect(consumeAiOpMock).toHaveBeenCalledWith(
      'agent-meefi', 1, expect.objectContaining({ source: 'meefi_2fa_recovery' }),
    );
  });

  it('capture_bug_report siempre cobra meefi_bug_report', async () => {
    await executeMeefiCaptureBugReport(
      { agent: { id: 'agent-meefi' } } as any,
      { user_id: 'usr_003', description: 'transfer no llega' },
    );
    expect(consumeAiOpMock).toHaveBeenCalledOnce();
    expect(consumeAiOpMock).toHaveBeenCalledWith(
      'agent-meefi', 1, expect.objectContaining({
        source: 'meefi_bug_report',
        label:  'Reporte de bug Meefi capturado',
      }),
    );
  });

  it('sin ctx.agent.id, los 3 tools no intentan cobrar (defensivo)', async () => {
    await executeMeefiSendPasswordResetLink({} as any, { user_id: 'usr_002' });
    await executeMeefiInitiate2faRecovery({} as any, { user_id: 'usr_002' });
    await executeMeefiCaptureBugReport({} as any, { user_id: 'usr_003', description: 'x' });
    expect(consumeAiOpMock).not.toHaveBeenCalled();
  });
});
