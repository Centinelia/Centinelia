import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSentGmailForVoice, fetchSentOutlookForVoice, stripEmailBoilerplate, extractBodyFromGmailPayload } from '../fetch-recent';

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
});

// ─── Gmail ────────────────────────────────────────────────────────────────────

describe('fetchSentGmailForVoice', () => {
  it('usa query in:sent y devuelve body decodificado desde text/plain', async () => {
    // List
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'm1' }] }),
    } as Response);

    // Detail: message con payload text/plain en base64url
    const bodyPlain = 'Hola Juan, gracias por tu mensaje. Quedamos atentos, saludos cordiales.';
    const b64 = Buffer.from(bodyPlain, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        snippet: 'Hola Juan',
        payload: {
          headers: [{ name: 'Subject', value: 'Re: cotización' }],
          mimeType: 'text/plain',
          body: { data: b64 },
        },
      }),
    } as Response);

    const since = new Date('2026-09-01T00:00:00Z');
    const out   = await fetchSentGmailForVoice('tok', since, 20);

    expect(out).toHaveLength(1);
    expect(out[0].subject).toBe('Re: cotización');
    expect(out[0].body).toBe(bodyPlain);

    const listCall = fetchMock.mock.calls[0][0] as string;
    expect(listCall).toContain('in%3Asent');
    expect(listCall).toContain('after%3A');
  });

  it('descarta correos sin body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'm1' }] }),
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        snippet: 'x',
        payload: { headers: [], mimeType: 'text/plain', body: {} },
      }),
    } as Response);

    const out = await fetchSentGmailForVoice('tok', new Date(), 20);
    expect(out).toEqual([]);
  });

  it('extrae body de multipart con text/plain anidado', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'm1' }] }),
    } as Response);

    const plain = 'Este es el contenido plano del correo.';
    const b64 = Buffer.from(plain, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        snippet: 'x',
        payload: {
          headers: [{ name: 'Subject', value: 'Test' }],
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/html', body: { data: 'aWdub3JhZG8=' } },
            { mimeType: 'text/plain', body: { data: b64 } },
          ],
        },
      }),
    } as Response);

    const out = await fetchSentGmailForVoice('tok', new Date(), 20);
    expect(out).toHaveLength(1);
    expect(out[0].body).toBe(plain);
  });

  it('devuelve [] si la lista falla', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    const out = await fetchSentGmailForVoice('tok', new Date(), 20);
    expect(out).toEqual([]);
  });
});

// ─── Outlook ──────────────────────────────────────────────────────────────────

describe('fetchSentOutlookForVoice', () => {
  it('usa carpeta SentItems y strippea HTML', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            subject: 'Cotización',
            bodyPreview: 'preview',
            body: {
              contentType: 'html',
              content: '<p>Hola <strong>Juan</strong>,</p><p>Gracias por tu mensaje.</p>',
            },
          },
        ],
      }),
    } as Response);

    const since = new Date('2026-09-01T00:00:00Z');
    const out   = await fetchSentOutlookForVoice('tok', since, 20);

    expect(out).toHaveLength(1);
    expect(out[0].body).toBe('Hola Juan , Gracias por tu mensaje.');
    expect(out[0].subject).toBe('Cotización');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/mailFolders/SentItems/messages');
    expect(url).toContain('sentDateTime');
  });

  it('devuelve [] si el body está vacío', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          { subject: 'x', bodyPreview: '', body: { contentType: 'text', content: '' } },
        ],
      }),
    } as Response);

    const out = await fetchSentOutlookForVoice('tok', new Date(), 20);
    expect(out).toEqual([]);
  });

  it('aplica stripEmailBoilerplate al body Outlook (quita "Enviado desde")', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            subject: 'Cotización',
            bodyPreview: 'x',
            body: {
              contentType: 'text',
              content:
                'Hola Juan, adjunto la cotización que solicitaste. Quedo atento.\n\nEnviado desde mi iPhone',
            },
          },
        ],
      }),
    } as Response);
    const out = await fetchSentOutlookForVoice('tok', new Date(), 20);
    expect(out[0].body).toBe('Hola Juan, adjunto la cotización que solicitaste. Quedo atento.');
    expect(out[0].body).not.toContain('Enviado desde');
  });
});

// ─── stripEmailBoilerplate — 8 casos ──────────────────────────────────────────

describe('stripEmailBoilerplate', () => {
  it('quita "Enviado desde mi iPhone" al final', () => {
    const raw = 'Gracias por tu correo. Nos vemos el martes.\n\nEnviado desde mi iPhone';
    expect(stripEmailBoilerplate(raw)).toBe('Gracias por tu correo. Nos vemos el martes.');
  });

  it('quita "Sent from my iPhone" (inglés)', () => {
    const raw = 'Thanks, see you Tuesday.\n\nSent from my iPhone';
    expect(stripEmailBoilerplate(raw)).toBe('Thanks, see you Tuesday.');
  });

  it('quita "Get Outlook for iOS"', () => {
    const raw = 'Perfecto, te confirmo mañana.\n\nGet Outlook for iOS';
    expect(stripEmailBoilerplate(raw)).toBe('Perfecto, te confirmo mañana.');
  });

  it('quita quote replies estilo "El X escribió:"', () => {
    const raw = `Claro, aquí va la propuesta.

El 25 de septiembre de 2026 a las 10:14, Juan Pérez <juan@ejemplo.com> escribió:
> Hola, ¿me puedes mandar la propuesta?
> Saludos`;
    const out = stripEmailBoilerplate(raw);
    expect(out).toBe('Claro, aquí va la propuesta.');
    expect(out).not.toContain('juan@ejemplo.com');
    expect(out).not.toContain('¿me puedes mandar');
  });

  it('quita quote replies estilo "On X wrote:"', () => {
    const raw = `Sure, here you go.

On Sep 25, 2026, at 10:14 AM, Jane Doe <jane@x.com> wrote:
> Can you send me the doc?`;
    expect(stripEmailBoilerplate(raw)).toBe('Sure, here you go.');
  });

  it('quita firma separada por "--"', () => {
    const raw = `Con gusto te ayudo con esa cotización.

--
Juan Pérez
Director Comercial
Tortillería Estrella
juan@tortillasestrella.mx | +52 81 1234 5678`;
    const out = stripEmailBoilerplate(raw);
    expect(out).toBe('Con gusto te ayudo con esa cotización.');
    expect(out).not.toContain('Juan Pérez');
    expect(out).not.toContain('tortillasestrella');
  });

  it('quita disclaimer legal "Este correo es confidencial"', () => {
    const raw = `Adjunto el contrato firmado.

Este correo es confidencial y está dirigido exclusivamente al destinatario. Si usted no es el destinatario, borre este mensaje.`;
    const out = stripEmailBoilerplate(raw);
    expect(out).toBe('Adjunto el contrato firmado.');
    expect(out).not.toContain('confidencial');
  });

  it('no toca el body si no hay boilerplate', () => {
    const raw = 'Hola María, gracias por tu paciencia. Te confirmo la cita para el viernes a las 3pm.';
    expect(stripEmailBoilerplate(raw)).toBe(raw);
  });

  it('devuelve string vacío si input vacío o whitespace', () => {
    expect(stripEmailBoilerplate('')).toBe('');
    expect(stripEmailBoilerplate('   \n\n  ')).toBe('');
  });
});

// ─── extractBodyFromGmailPayload — edge cases ─────────────────────────────────

describe('extractBodyFromGmailPayload', () => {
  const b64 = (s: string) =>
    Buffer.from(s, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

  it('devuelve string vacío si payload undefined', () => {
    expect(extractBodyFromGmailPayload(undefined)).toBe('');
  });

  it('devuelve string vacío si no hay body ni parts', () => {
    expect(extractBodyFromGmailPayload({ mimeType: 'text/plain' })).toBe('');
  });

  it('prefiere text/plain sobre text/html', () => {
    const plain = 'contenido plano';
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html',  body: { data: b64('<p>html</p>') } },
        { mimeType: 'text/plain', body: { data: b64(plain) } },
      ],
    };
    expect(extractBodyFromGmailPayload(payload)).toBe(plain);
  });

  it('cae a text/html si no hay text/plain', () => {
    const payload = {
      mimeType: 'text/html',
      body: { data: b64('<p>Hola <strong>mundo</strong></p>') },
    };
    expect(extractBodyFromGmailPayload(payload)).toBe('Hola mundo');
  });

  it('decodifica entidades HTML comunes', () => {
    const payload = {
      mimeType: 'text/html',
      body: { data: b64('<p>Precio: 5&amp;10 &lt;IVA&gt;&nbsp;incluido</p>') },
    };
    expect(extractBodyFromGmailPayload(payload)).toBe('Precio: 5&10 <IVA> incluido');
  });

  it('busca recursivamente en multipart nested', () => {
    const plain = 'contenido anidado';
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64(plain) } },
          ],
        },
      ],
    };
    expect(extractBodyFromGmailPayload(payload)).toBe(plain);
  });
});
