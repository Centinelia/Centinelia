/**
 * parse.test.ts — unit tests for parseInboundEmail.
 *
 * No mocks needed: the function is pure (no I/O, no Supabase).
 */

import { describe, it, expect } from 'vitest';
import { parseInboundEmail, type RawInboundPayload } from '../parse';

const BASE: RawInboundPayload = {
  from:    'oficina@tortilleria.mx',
  to:      'facturacion@tortilleria.centinelia.ai',
  subject: 'Notitas del dia',
  text:    'Adjunto notitas',
  attachments: [
    { filename: 'nota_001.jpg', contentType: 'image/jpeg', content: Buffer.from('fake-jpg').toString('base64') },
    { filename: 'nota_002.pdf', contentType: 'application/pdf', content: Buffer.from('fake-pdf').toString('base64') },
  ],
};

describe('parseInboundEmail', () => {
  it('extracts basic email fields', () => {
    const parsed = parseInboundEmail(BASE);
    expect(parsed.from).toBe('oficina@tortilleria.mx');
    expect(parsed.to).toBe('facturacion@tortilleria.centinelia.ai');
    expect(parsed.subject).toBe('Notitas del dia');
    expect(parsed.text).toBe('Adjunto notitas');
  });

  it('keeps image and PDF attachments', () => {
    const parsed = parseInboundEmail(BASE);
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments[0].filename).toBe('nota_001.jpg');
    expect(parsed.attachments[1].filename).toBe('nota_002.pdf');
  });

  it('decodes base64 attachment content to Buffer', () => {
    const parsed = parseInboundEmail(BASE);
    expect(Buffer.isBuffer(parsed.attachments[0].content)).toBe(true);
    expect(parsed.attachments[0].content.toString()).toBe('fake-jpg');
  });

  it('passes through Buffer attachments unchanged', () => {
    const buf = Buffer.from('raw-bytes');
    const parsed = parseInboundEmail({
      ...BASE,
      attachments: [{ filename: 'scan.png', contentType: 'image/png', content: buf }],
    });
    expect(parsed.attachments[0].content).toBe(buf);
  });

  it('sets hasAttachments true when allowed attachments exist', () => {
    const parsed = parseInboundEmail(BASE);
    expect(parsed.hasAttachments).toBe(true);
  });

  it('sets hasAttachments false when no attachments present', () => {
    const parsed = parseInboundEmail({ ...BASE, attachments: [] });
    expect(parsed.hasAttachments).toBe(false);
  });

  it('filters out disallowed attachment types', () => {
    const parsed = parseInboundEmail({
      ...BASE,
      attachments: [
        { filename: 'nota.jpg',  contentType: 'image/jpeg',        content: 'abc=' },
        { filename: 'data.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: 'abc=' },
        { filename: 'doc.docx',  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', content: 'abc=' },
        { filename: 'raw.bin',   contentType: 'application/octet-stream', content: 'abc=' },
      ],
    });
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe('nota.jpg');
  });

  it('accepts all allowed MIME types', () => {
    const types = [
      { filename: 'a.jpg',  contentType: 'image/jpeg'       },
      { filename: 'b.png',  contentType: 'image/png'        },
      { filename: 'c.webp', contentType: 'image/webp'       },
      { filename: 'd.heic', contentType: 'image/heic'       },
      { filename: 'e.pdf',  contentType: 'application/pdf'  },
    ];
    const parsed = parseInboundEmail({
      ...BASE,
      attachments: types.map((t) => ({ ...t, content: 'YQ==' })),
    });
    expect(parsed.attachments).toHaveLength(5);
  });

  it('sets hasAttachments false when all attachments are disallowed types', () => {
    const parsed = parseInboundEmail({
      ...BASE,
      attachments: [
        { filename: 'data.csv', contentType: 'text/csv', content: 'abc=' },
      ],
    });
    expect(parsed.hasAttachments).toBe(false);
    expect(parsed.attachments).toHaveLength(0);
  });

  it('defaults missing fields to empty strings', () => {
    const parsed = parseInboundEmail({});
    expect(parsed.from).toBe('');
    expect(parsed.to).toBe('');
    expect(parsed.subject).toBe('');
    expect(parsed.text).toBe('');
    expect(parsed.attachments).toHaveLength(0);
    expect(parsed.hasAttachments).toBe(false);
  });

  it('extracts Message-ID from raw headers string', () => {
    const parsed = parseInboundEmail({
      ...BASE,
      headers: 'Message-ID: <abc123@mail.example.com>\nFrom: x@y.com',
    });
    expect(parsed.messageId).toBe('abc123@mail.example.com');
  });

  it('returns null messageId when no Message-ID header', () => {
    const parsed = parseInboundEmail({ ...BASE, headers: 'From: x@y.com\nTo: z@w.com' });
    expect(parsed.messageId).toBeNull();
  });

  it('returns null messageId when headers field is absent', () => {
    const parsed = parseInboundEmail(BASE);
    expect(parsed.messageId).toBeNull();
  });

  it('handles Message-Id (lowercase d) header variant', () => {
    const parsed = parseInboundEmail({
      ...BASE,
      headers: 'Message-Id: <variant@mail.example.com>',
    });
    expect(parsed.messageId).toBe('variant@mail.example.com');
  });
});
