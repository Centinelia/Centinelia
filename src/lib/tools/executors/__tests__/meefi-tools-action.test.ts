import { describe, it, expect } from 'vitest';
import { executeMeefiSendPasswordResetLink } from '../meefi-send-password-reset-link';
import { executeMeefiInitiate2faRecovery } from '../meefi-initiate-2fa-recovery';
import { executeMeefiCaptureBugReport } from '../meefi-capture-bug-report';

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
