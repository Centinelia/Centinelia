/**
 * send.test.ts — unit tests for the billing outbound mail helper.
 *
 * Mocks:
 *   - sendEmail from src/lib/email/send.ts (no real HTTP calls)
 *   - @/lib/supabase/admin (no real DB)
 *
 * Verifies:
 *   - simple send (to, subject, body)
 *   - threading headers (In-Reply-To, References) when threadRef is provided
 *   - attachments forwarded correctly
 *   - custom from address override
 *   - error propagation from sendEmail
 *   - replyToInboundEmail: lookup + threading (Task 5 implementation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock sendEmail from src/lib/email/send.ts ──────────────────────────────
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(),
}));

// ── Mock Supabase admin ────────────────────────────────────────────────────
const mockMaybeSingle = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  }),
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

describe('replyToInboundEmail (Task 5 — real lookup)', () => {
  it('sends a reply with threading headers when message_id is present', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        from_address: 'oficina@tortilleria.mx',
        subject:      'Notitas del dia',
        message_id:   'abc123@mail.example.com',
      },
      error: null,
    });
    mockSendEmail.mockResolvedValueOnce(true);

    const result = await replyToInboundEmail('email-uuid-1', '<p>Adjuntamos respuesta.</p>');

    expect(result).toHaveProperty('messageId');
    expect(mockSendEmail).toHaveBeenCalledOnce();

    const callArgs = mockSendEmail.mock.calls[0][0];
    expect(callArgs.to).toBe('oficina@tortilleria.mx');
    expect(callArgs.subject).toBe('Re: Notitas del dia');
    expect(callArgs.headers?.['In-Reply-To']).toBe('<abc123@mail.example.com>');
    expect(callArgs.headers?.['References']).toContain('<abc123@mail.example.com>');
  });

  it('wraps message_id in angle brackets if not already wrapped', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        from_address: 'x@y.mx',
        subject:      'Test',
        message_id:   'bare-id@example.com',
      },
      error: null,
    });
    mockSendEmail.mockResolvedValueOnce(true);

    await replyToInboundEmail('email-uuid-2', '<p>OK</p>');

    const callArgs = mockSendEmail.mock.calls[0][0];
    expect(callArgs.headers?.['In-Reply-To']).toBe('<bare-id@example.com>');
  });

  it('does not add threading headers when message_id is null and logs warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        from_address: 'x@y.mx',
        subject:      'Sin message-id',
        message_id:   null,
      },
      error: null,
    });
    mockSendEmail.mockResolvedValueOnce(true);

    await replyToInboundEmail('email-uuid-3', '<p>Sin threading</p>');

    const callArgs = mockSendEmail.mock.calls[0][0];
    expect(callArgs.headers).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no message_id'));

    warnSpy.mockRestore();
  });

  it('prefixes subject with "Re: " if not already prefixed', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { from_address: 'x@y.mx', subject: 'Factura pendiente', message_id: 'id@x.com' },
      error: null,
    });
    mockSendEmail.mockResolvedValueOnce(true);

    await replyToInboundEmail('e4', '<p>ok</p>');
    expect(mockSendEmail.mock.calls[0][0].subject).toBe('Re: Factura pendiente');
  });

  it('does not double-prefix subject that already starts with "Re:"', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { from_address: 'x@y.mx', subject: 'Re: Factura pendiente', message_id: 'id@x.com' },
      error: null,
    });
    mockSendEmail.mockResolvedValueOnce(true);

    await replyToInboundEmail('e5', '<p>ok</p>');
    expect(mockSendEmail.mock.calls[0][0].subject).toBe('Re: Factura pendiente');
  });

  it('throws when emailId is not found in billing_incoming_emails', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(replyToInboundEmail('missing-id', '<p>X</p>')).rejects.toThrow(
      'no billing_incoming_emails row found',
    );
  });

  it('throws when DB lookup returns an error', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

    await expect(replyToInboundEmail('bad-id', '<p>X</p>')).rejects.toThrow('DB lookup failed');
  });

  it('forwards attachments to sendBillingMail', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { from_address: 'x@y.mx', subject: 'Test', message_id: 'id@x.com' },
      error: null,
    });
    mockSendEmail.mockResolvedValueOnce(true);

    const attachments = [{ filename: 'factura.pdf', content: Buffer.from('pdf') }];
    await replyToInboundEmail('e6', '<p>ok</p>', attachments);

    const sentAtts = mockSendEmail.mock.calls[0][0].attachments ?? [];
    expect(sentAtts).toHaveLength(1);
    expect(sentAtts[0].filename).toBe('factura.pdf');
  });
});
