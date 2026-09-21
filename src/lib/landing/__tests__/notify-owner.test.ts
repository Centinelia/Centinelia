/**
 * notify-owner unit tests — mock sendEmail
 *
 * Verifica que notifyOwnerFallback y notifyOwnerNewLead llaman a sendEmail
 * con los datos correctos del lead y el destinatario del owner.
 *
 * sendEmail retorna Promise<boolean> (no throw). Firma verificada en send.ts:360.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock sendEmail ───────────────────────────────────────────────────────────

const mockSendEmail = vi.fn().mockResolvedValue(true);

vi.mock('@/lib/email/send', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

import { notifyOwnerFallback, notifyOwnerNewLead } from '../notify-owner';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('notifyOwnerFallback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envia correo al owner con subject que contiene FALLBACK', async () => {
    await notifyOwnerFallback({
      requestId: 'r1',
      phone:     '8112345678',
      orgName: 'Test Org', orgDescription: 'Test desc', expectation: 'Test exp',
      reason:    'vapi_call_failed',
    });
    expect(mockSendEmail).toHaveBeenCalledOnce();
    const [opts] = mockSendEmail.mock.calls[0];
    expect(opts.to).toBe('nazre20@gmail.com');
    expect(opts.subject).toContain('FALLBACK');
  });

  it('incluye el telefono en el subject', async () => {
    await notifyOwnerFallback({
      requestId: 'r2',
      phone:     '8119999999',
      orgName: 'Test Org', orgDescription: 'Test desc', expectation: 'Test exp',
      reason:    'vapi_no_phone',
    });
    const [opts] = mockSendEmail.mock.calls[0];
    expect(opts.subject).toContain('8119999999');
  });

  it('incluye requestId, telefono, industria y reason en el html', async () => {
    await notifyOwnerFallback({
      requestId: 'r3',
      phone:     '8112345678',
      orgName: 'Test Org', orgDescription: 'Test desc', expectation: 'Test exp',
      reason:    'agent_not_seeded',
    });
    const [opts] = mockSendEmail.mock.calls[0];
    expect(opts.html).toContain('r3');
    expect(opts.html).toContain('8112345678');
    expect(opts.html).toContain('servicios_profesionales');
    expect(opts.html).toContain('agent_not_seeded');
  });

  it('no lanza si sendEmail retorna false', async () => {
    mockSendEmail.mockResolvedValueOnce(false);
    // No debe lanzar — el fallback del fallback no debe crashear el pipeline
    await expect(
      notifyOwnerFallback({ requestId: 'r4', phone: '8112345678', orgName: 'Test Org', orgDescription: 'Test desc', expectation: 'Test exp', reason: 'x' }),
    ).resolves.toBeUndefined();
  });
});

describe('notifyOwnerNewLead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envia correo al owner con subject que contiene el telefono e industria', async () => {
    await notifyOwnerNewLead({
      requestId: 'r5',
      phone:     '8112345678',
      orgName: 'Test Org', orgDescription: 'Test desc', expectation: 'Test exp',
    });
    expect(mockSendEmail).toHaveBeenCalledOnce();
    const [opts] = mockSendEmail.mock.calls[0];
    expect(opts.to).toBe('nazre20@gmail.com');
    expect(opts.subject).toContain('despacho_contable');
    expect(opts.subject).toContain('8112345678');
  });

  it('incluye requestId en el html', async () => {
    await notifyOwnerNewLead({ requestId: 'r6', phone: '8112345678', orgName: 'Test Org', orgDescription: 'Test desc', expectation: 'Test exp' });
    const [opts] = mockSendEmail.mock.calls[0];
    expect(opts.html).toContain('r6');
  });
});
