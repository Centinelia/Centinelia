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

// Preserva los helpers de branding (shell, heading, badge, btn, …) y solo
// mockea sendEmail. Sin importOriginal, notify-owner.ts crashea con
// "badge is not a function" al construir el HTML del correo.
vi.mock('@/lib/email/send', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email/send')>();
  return {
    ...actual,
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  };
});

import { notifyOwnerFallback, notifyOwnerNewLead } from '../notify-owner';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('notifyOwnerFallback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envia correo al owner con subject que marca Fallback', async () => {
    await notifyOwnerFallback({
      requestId: 'r1',
      phone:     '8112345678',
      orgName: 'Test Org', orgDescription: 'Test desc', expectation: 'Test exp',
      reason:    'vapi_call_failed',
    });
    expect(mockSendEmail).toHaveBeenCalledOnce();
    const [opts] = mockSendEmail.mock.calls[0];
    expect(opts.to).toBe('hola@centinelia.mx');
    expect(opts.subject).toContain('Fallback');
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

  it('incluye requestId, telefono, orgName y reason en el html', async () => {
    await notifyOwnerFallback({
      requestId: 'r3',
      phone:     '8112345678',
      orgName: 'Despacho XYZ', orgDescription: 'Test desc', expectation: 'Test exp',
      reason:    'agent_not_seeded',
    });
    const [opts] = mockSendEmail.mock.calls[0];
    expect(opts.html).toContain('r3');
    expect(opts.html).toContain('8112345678');
    expect(opts.html).toContain('Despacho XYZ');
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

  it('envia correo al owner con subject que contiene el telefono y orgName', async () => {
    await notifyOwnerNewLead({
      requestId: 'r5',
      phone:     '8112345678',
      orgName: 'Despacho ABC', orgDescription: 'Test desc', expectation: 'Test exp',
    });
    expect(mockSendEmail).toHaveBeenCalledOnce();
    const [opts] = mockSendEmail.mock.calls[0];
    expect(opts.to).toBe('hola@centinelia.mx');
    expect(opts.subject).toContain('Despacho ABC');
    expect(opts.subject).toContain('8112345678');
  });

  it('incluye requestId en el html', async () => {
    await notifyOwnerNewLead({ requestId: 'r6', phone: '8112345678', orgName: 'Test Org', orgDescription: 'Test desc', expectation: 'Test exp' });
    const [opts] = mockSendEmail.mock.calls[0];
    expect(opts.html).toContain('r6');
  });
});
