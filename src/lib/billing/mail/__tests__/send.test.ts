/**
 * send.test.ts — unit tests for the billing outbound mail helper.
 *
 * Mocks the underlying sendEmail function from src/lib/email/send.ts so no
 * real HTTP calls are made. Verifies:
 *   - simple send (to, subject, body)
 *   - threading headers (In-Reply-To, References) when threadRef is provided
 *   - attachments forwarded correctly
 *   - custom from address override
 *   - error propagation from sendEmail
 *   - replyToInboundEmail stub logs and returns a dummy messageId (Task 5 pending)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock sendEmail from src/lib/email/send.ts ──────────────────────────────
// We mock the module before importing the billing mail helper so that the
// helper picks up the mocked version.
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(),
}));

import { sendEmail } from '@/lib/email/send';
import { sendBillingMail, replyToInboundEmail } from '@/lib/billing/mail/send';

const mockSendEmail = vi.mocked(sendEmail);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendBillingMail', () => {
  it('sends a simple email and returns the messageId', async () => {
    mockSendEmail.mockResolvedValueOnce(true);

    // The underlying sendEmail returns boolean, but sendBillingMail must
    // return { messageId }. We need the wrapper to generate/capture the id.
    // After implementation, this resolves to a non-empty string.
    const result = await sendBillingMail({
      to: 'cliente@empresa.mx',
      subject: 'Tu factura del mes',
      body: '<p>Adjuntamos tu factura.</p>',
    });

    expect(mockSendEmail).toHaveBeenCalledOnce();
    const callArgs = mockSendEmail.mock.calls[0][0];
    expect(callArgs.to).toBe('cliente@empresa.mx');
    expect(callArgs.subject).toBe('Tu factura del mes');
    expect(callArgs.html).toBe('<p>Adjuntamos tu factura.</p>');

    expect(result).toHaveProperty('messageId');
    expect(typeof result.messageId).toBe('string');
    expect(result.messageId.length).toBeGreaterThan(0);
  });

  it('includes In-Reply-To and References headers when threadRef is provided', async () => {
    mockSendEmail.mockResolvedValueOnce(true);

    await sendBillingMail({
      to: 'cliente@empresa.mx',
      subject: 'Re: Tu factura del mes',
      body: '<p>Respuesta.</p>',
      threadRef: {
        messageId: '<original-msg-id@resend.dev>',
        references: ['<root-msg-id@resend.dev>'],
      },
    });

    const callArgs = mockSendEmail.mock.calls[0][0];
    // The billing helper must pass headers through to sendEmail (or call
    // the Resend API directly). We verify the call carries thread context.
    expect(callArgs).toHaveProperty('headers');
    const headers = (callArgs as Record<string, unknown>).headers as Record<string, string>;
    expect(headers['In-Reply-To']).toBe('<original-msg-id@resend.dev>');
    expect(headers['References']).toContain('<original-msg-id@resend.dev>');
    expect(headers['References']).toContain('<root-msg-id@resend.dev>');
  });

  it('sets In-Reply-To without References array when references is omitted', async () => {
    mockSendEmail.mockResolvedValueOnce(true);

    await sendBillingMail({
      to: 'cliente@empresa.mx',
      subject: 'Re: Factura',
      body: '<p>Ok.</p>',
      threadRef: {
        messageId: '<solo-msg-id@resend.dev>',
      },
    });

    const callArgs = mockSendEmail.mock.calls[0][0];
    const headers = (callArgs as Record<string, unknown>).headers as Record<string, string>;
    expect(headers['In-Reply-To']).toBe('<solo-msg-id@resend.dev>');
    expect(headers['References']).toBe('<solo-msg-id@resend.dev>');
  });

  it('forwards attachments to sendEmail', async () => {
    mockSendEmail.mockResolvedValueOnce(true);

    const attachments = [
      { filename: 'factura.pdf', content: Buffer.from('pdf-content') },
      { filename: 'nota.xml', content: 'base64encodedstring' },
    ];

    await sendBillingMail({
      to: 'cliente@empresa.mx',
      subject: 'Factura con adjuntos',
      body: '<p>Ver adjuntos.</p>',
      attachments,
    });

    const callArgs = mockSendEmail.mock.calls[0][0];
    expect(callArgs.attachments).toHaveLength(2);
    expect(callArgs.attachments![0].filename).toBe('factura.pdf');
    expect(callArgs.attachments![1].filename).toBe('nota.xml');
  });

  it('uses provided from address when given', async () => {
    mockSendEmail.mockResolvedValueOnce(true);

    await sendBillingMail({
      to: 'cliente@empresa.mx',
      subject: 'Test from override',
      body: '<p>Hola.</p>',
      from: 'facturacion@tortilleria.centinelia.ai',
    });

    const callArgs = mockSendEmail.mock.calls[0][0];
    expect(callArgs.from).toBe('facturacion@tortilleria.centinelia.ai');
  });

  it('uses provided replyTo when given', async () => {
    mockSendEmail.mockResolvedValueOnce(true);

    await sendBillingMail({
      to: 'cliente@empresa.mx',
      subject: 'Test replyTo',
      body: '<p>Hola.</p>',
      replyTo: 'soporte@empresa.mx',
    });

    const callArgs = mockSendEmail.mock.calls[0][0];
    expect(callArgs.replyTo).toBe('soporte@empresa.mx');
  });

  it('throws when sendEmail returns false (delivery failure)', async () => {
    mockSendEmail.mockResolvedValueOnce(false);

    await expect(
      sendBillingMail({
        to: 'cliente@empresa.mx',
        subject: 'Falla',
        body: '<p>Esto fallara.</p>',
      })
    ).rejects.toThrow();
  });

  it('propagates errors thrown by sendEmail', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('Resend API down'));

    await expect(
      sendBillingMail({
        to: 'cliente@empresa.mx',
        subject: 'Error test',
        body: '<p>Error.</p>',
      })
    ).rejects.toThrow('Resend API down');
  });
});

describe('replyToInboundEmail (stub — Task 5 pending)', () => {
  it('returns a dummy messageId and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await replyToInboundEmail('some-email-id', '<p>Respuesta.</p>');

    expect(result).toHaveProperty('messageId');
    expect(typeof result.messageId).toBe('string');
    // Must log a warning about the missing table
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('billing_incoming_emails'),
    );

    warnSpy.mockRestore();
  });
});
