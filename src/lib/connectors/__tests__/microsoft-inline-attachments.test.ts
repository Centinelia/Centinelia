import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMicrosoftConnector } from '../microsoft';

/**
 * Regression test — bug reportado por Nazre 2026-10-07:
 * Camila mandó la hoja de salida F-3949 como JPEG pegado al body del correo
 * (clipboard paste → Outlook la marca isInline=true). El connector filtraba
 * TODOS los inline attachments → la imagen nunca llegaba al pipeline multimodal
 * de Nami → Nami pidió "manda la hoja" cuando ya venía adjunta.
 *
 * Fix: heurística de tamaño. isInline+image/* ≤ 5KB = logo de firma, skipear.
 * isInline+image/* > 5KB = contenido real (foto/screenshot/scan), incluir.
 */

const originalFetch = globalThis.fetch;

function mockGraph(responseByUrl: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const key of Object.keys(responseByUrl)) {
      if (url.includes(key)) {
        return new Response(JSON.stringify(responseByUrl[key]), { status: 200 });
      }
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('Microsoft fetchUnread — inline attachments', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('BUG FIX: incluye imagen inline > 5KB (hoja de salida pegada al body)', async () => {
    mockGraph({
      '/mailFolders/Inbox/messages': {
        value: [{
          id: 'msg-1',
          conversationId: 'thread-1',
          from: { emailAddress: { name: 'Nazre', address: 'hola@centinelia.mx' } },
          subject: 'Re: Factura Trane para OC6203',
          body: { content: 'Adjunto la imagen de la hoja de salida con folio 3949' },
          hasAttachments: true,
        }],
      },
      '/messages/msg-1/attachments': {
        value: [{
          id: 'att-hoja-salida',
          name: 'Hoja de Salida.jpeg',
          contentType: 'image/jpeg',
          size: 199620,
          isInline: true,
        }],
      },
    });
    const conn = createMicrosoftConnector('fake-token');
    const msgs = await conn.email.fetchUnread(new Date('2026-01-01'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].attachments).toHaveLength(1);
    expect(msgs[0].attachments![0].name).toBe('Hoja de Salida.jpeg');
    expect(msgs[0].attachments![0].mimeType).toBe('image/jpeg');
  });

  it('FILTRA imagen inline ≤ 5KB (logo de firma)', async () => {
    mockGraph({
      '/mailFolders/Inbox/messages': {
        value: [{
          id: 'msg-2',
          conversationId: 'thread-2',
          from: { emailAddress: { name: 'Camila', address: 'camila@acproyectos.com' } },
          subject: 'Pregunta rápida',
          body: { content: 'Hola, duda sobre OC...' },
          hasAttachments: true,
        }],
      },
      '/messages/msg-2/attachments': {
        value: [{
          id: 'att-logo-sig',
          name: 'logo-firma.png',
          contentType: 'image/png',
          size: 3200,
          isInline: true,
        }],
      },
    });
    const conn = createMicrosoftConnector('fake-token');
    const msgs = await conn.email.fetchUnread(new Date('2026-01-01'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].attachments).toHaveLength(0);
  });

  it('INCLUYE attachment no-inline aunque sea pequeño (adjunto formal)', async () => {
    mockGraph({
      '/mailFolders/Inbox/messages': {
        value: [{
          id: 'msg-3',
          conversationId: 'thread-3',
          from: { emailAddress: { name: 'Trane', address: 'noreply@trane.com' } },
          subject: 'Factura',
          body: { content: 'Adjunto CFDI' },
          hasAttachments: true,
        }],
      },
      '/messages/msg-3/attachments': {
        value: [{
          id: 'att-xml',
          name: 'factura.xml',
          contentType: 'application/xml',
          size: 2000,
          isInline: false,
        }],
      },
    });
    const conn = createMicrosoftConnector('fake-token');
    const msgs = await conn.email.fetchUnread(new Date('2026-01-01'));
    expect(msgs[0].attachments).toHaveLength(1);
    expect(msgs[0].attachments![0].name).toBe('factura.xml');
  });

  it('INCLUYE attachment inline que NO es imagen (ej. XML inline raro)', async () => {
    mockGraph({
      '/mailFolders/Inbox/messages': {
        value: [{
          id: 'msg-4',
          conversationId: 'thread-4',
          from: { emailAddress: { name: 'X', address: 'x@y.com' } },
          subject: 'Doc',
          body: { content: 'ver' },
          hasAttachments: true,
        }],
      },
      '/messages/msg-4/attachments': {
        value: [{
          id: 'att-pdf',
          name: 'inline-pdf.pdf',
          contentType: 'application/pdf',
          size: 1024,
          isInline: true,
        }],
      },
    });
    const conn = createMicrosoftConnector('fake-token');
    const msgs = await conn.email.fetchUnread(new Date('2026-01-01'));
    expect(msgs[0].attachments).toHaveLength(1);
    expect(msgs[0].attachments![0].name).toBe('inline-pdf.pdf');
  });

  it('MIX: incluye hoja de salida real, filtra logo de firma', async () => {
    mockGraph({
      '/mailFolders/Inbox/messages': {
        value: [{
          id: 'msg-5',
          conversationId: 'thread-5',
          from: { emailAddress: { name: 'Nazre', address: 'hola@centinelia.mx' } },
          subject: 'Hoja + firma',
          body: { content: 'ver imagen' },
          hasAttachments: true,
        }],
      },
      '/messages/msg-5/attachments': {
        value: [
          { id: 'logo', name: 'logo.png', contentType: 'image/png', size: 2500, isInline: true },
          { id: 'hoja', name: 'hoja.jpg', contentType: 'image/jpeg', size: 199620, isInline: true },
        ],
      },
    });
    const conn = createMicrosoftConnector('fake-token');
    const msgs = await conn.email.fetchUnread(new Date('2026-01-01'));
    expect(msgs[0].attachments).toHaveLength(1);
    expect(msgs[0].attachments![0].name).toBe('hoja.jpg');
  });
});
