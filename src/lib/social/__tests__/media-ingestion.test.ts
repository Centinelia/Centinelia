/**
 * Tests de comportamiento para ingestNaviMediaFromEmail.
 *
 * Todos los tests inyectan un cliente Supabase mockeado y un EmailConnector stub —
 * sin hits a base de datos ni a storage real.
 *
 * Casos cubiertos:
 *   (a) Agente navi con 1 imagen + 1 pdf → 1 ingestado (pdf filtrado silenciosamente)
 *   (b) Agente role='nia' → retorna {ingested:0, skipped:[]} sin storage/BD
 *   (c) Video 150 MB → en skipped[] con razón de tamaño
 *   (d) fetchAttachment retorna null → skipped con razón fetch-failed
 *   (e) Camino feliz video → 1 fila insertada con source='email' y source_message_id
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmailConnector, EmailAttachmentMeta } from '@/lib/connectors/types';
import { ingestNaviMediaFromEmail } from '../media-ingestion';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeImageMeta(overrides?: Partial<EmailAttachmentMeta>): EmailAttachmentMeta {
  return {
    id:       'att-img-001',
    name:     'foto.jpg',
    mimeType: 'image/jpeg',
    size:     500_000, // 500 KB
    ...overrides,
  };
}

function makeVideoMeta(overrides?: Partial<EmailAttachmentMeta>): EmailAttachmentMeta {
  return {
    id:       'att-vid-001',
    name:     'video.mp4',
    mimeType: 'video/mp4',
    size:     20 * 1024 * 1024, // 20 MB
    ...overrides,
  };
}

function makePdfMeta(): EmailAttachmentMeta {
  return { id: 'att-pdf-001', name: 'factura.pdf', mimeType: 'application/pdf', size: 200_000 };
}

function makeNaviAgent(role = 'navi') {
  return { id: 'agent-navi-uuid', role, portal_email: 'nazre20+navi-media-test@gmail.com' };
}

/** Crea un EmailConnector stub con fetchAttachment controlable. */
function makeConnector(fetchResult: Buffer | null = Buffer.from('bytes')): EmailConnector {
  return {
    fetchUnread:     vi.fn(async () => []),
    send:            vi.fn(async () => {}),
    sendReply:       vi.fn(async () => {}),
    markRead:        vi.fn(async () => {}),
    fetchAttachment: vi.fn(async () => fetchResult),
  };
}

/** Crea un mock de Supabase que registra llamadas a storage e insert. */
function makeSupabaseMock(opts: {
  uploadError?:     string;
  signedUrlError?:  string;
  signedUrl?:       string;
  insertError?:     string;
} = {}) {
  const insertLog:   unknown[]            = [];
  const uploadCalls: string[]             = [];

  const storageMock = {
    from: vi.fn((_bucket: string) => ({
      upload: vi.fn(async (path: string) => {
        uploadCalls.push(path);
        return opts.uploadError
          ? { error: { message: opts.uploadError } }
          : { error: null };
      }),
      createSignedUrl: vi.fn(async () => {
        if (opts.signedUrlError) return { data: null, error: { message: opts.signedUrlError } };
        return { data: { signedUrl: opts.signedUrl ?? 'https://cdn.example.com/media/file.jpg' }, error: null };
      }),
    })),
  };

  const fromMock = vi.fn((_table: string) => ({
    insert: vi.fn((data: unknown) => {
      insertLog.push(data);
      return Promise.resolve(
        opts.insertError ? { error: { message: opts.insertError } } : { error: null },
      );
    }),
  }));

  return {
    storage: storageMock,
    from:    fromMock,
    getInsertLog:  () => insertLog,
    getUploadCalls: () => uploadCalls,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ingestNaviMediaFromEmail', () => {

  beforeEach(() => vi.clearAllMocks());

  // (a) role navi, 1 imagen + 1 pdf → 1 ingestado, pdf filtrado silenciosamente
  it('(a) filtra pdf silenciosamente y persiste solo la imagen', async () => {
    const connector = makeConnector(Buffer.from('img-bytes'));
    const supabase  = makeSupabaseMock();
    const agent     = makeNaviAgent('navi');

    const result = await ingestNaviMediaFromEmail(
      connector,
      agent,
      {
        id:          'msg-001',
        text:        'Te envío la foto del producto',
        attachments: [makeImageMeta(), makePdfMeta()],
      },
      supabase as never,
    );

    expect(result.ingested).toBe(1);
    // El pdf NO debe aparecer en skipped (se filtra silenciosamente, sin entrada)
    expect(result.skipped).toHaveLength(0);
    // Debe haber hecho insert solo una vez (la imagen)
    expect(supabase.getInsertLog()).toHaveLength(1);
  });

  // (b) role nia → retorna cero sin tocar storage ni BD
  it('(b) role nia → retorna {ingested:0, skipped:[]} sin llamadas a storage/BD', async () => {
    const connector = makeConnector();
    const supabase  = makeSupabaseMock();
    const agent     = makeNaviAgent('nia');

    const result = await ingestNaviMediaFromEmail(
      connector,
      agent,
      { id: 'msg-002', attachments: [makeImageMeta()] },
      supabase as never,
    );

    expect(result.ingested).toBe(0);
    expect(result.skipped).toHaveLength(0);
    // No debe haber subido ni insertado nada
    expect(supabase.storage.from).not.toHaveBeenCalled();
    expect(supabase.getInsertLog()).toHaveLength(0);
  });

  // (c) video de 150 MB → en skipped[] con razón de tamaño
  it('(c) video de 150 MB → registrado en skipped[] con razón de tamaño', async () => {
    const connector = makeConnector();
    const supabase  = makeSupabaseMock();
    const agent     = makeNaviAgent('navi_agencia');
    const bigVideo  = makeVideoMeta({ size: 150 * 1024 * 1024, name: 'video-grande.mp4' });

    const result = await ingestNaviMediaFromEmail(
      connector,
      agent,
      { id: 'msg-003', attachments: [bigVideo] },
      supabase as never,
    );

    expect(result.ingested).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].name).toBe('video-grande.mp4');
    expect(result.skipped[0].reason).toMatch(/100 MB/i);
    // fetchAttachment no debe haberse llamado (rechazado antes de descargar)
    expect(connector.fetchAttachment).not.toHaveBeenCalled();
    expect(supabase.getInsertLog()).toHaveLength(0);
  });

  // (d) fetchAttachment retorna null → skipped con razón fetch-failed
  it('(d) fetchAttachment null → skipped con razón fetch-failed, sin insert', async () => {
    const connector = makeConnector(null); // fetchAttachment devuelve null
    const supabase  = makeSupabaseMock();
    const agent     = makeNaviAgent('navi');

    const result = await ingestNaviMediaFromEmail(
      connector,
      agent,
      { id: 'msg-004', attachments: [makeVideoMeta()] },
      supabase as never,
    );

    expect(result.ingested).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/fetch-failed/i);
    expect(supabase.getInsertLog()).toHaveLength(0);
  });

  // (e) camino feliz video → 1 fila con source='email' y source_message_id correcto
  it('(e) video válido → 1 fila insertada con source=email y source_message_id', async () => {
    const SIGNED_URL = 'https://cdn.example.com/user-media/video.mp4?tok=abc';
    const connector  = makeConnector(Buffer.from('video-bytes-real'));
    const supabase   = makeSupabaseMock({ signedUrl: SIGNED_URL });
    const agent      = makeNaviAgent('navi');

    const result = await ingestNaviMediaFromEmail(
      connector,
      agent,
      {
        id:          'msg-005',
        text:        'Te mando el video del evento',
        attachments: [makeVideoMeta({ name: 'evento.mp4', size: 10 * 1024 * 1024 })],
      },
      supabase as never,
    );

    expect(result.ingested).toBe(1);
    expect(result.skipped).toHaveLength(0);

    const insertLog = supabase.getInsertLog();
    expect(insertLog).toHaveLength(1);

    const row = insertLog[0] as Record<string, unknown>;
    expect(row.source).toBe('email');
    expect(row.source_message_id).toBe('msg-005');
    expect(row.file_url).toBe(SIGNED_URL);
    expect(row.portal_email).toBe(agent.portal_email);
    expect(row.agent_id).toBe(agent.id);
    expect(row.file_type).toBe('video/mp4');
    expect(row.status).toBe('available');
    // La nota del cliente debe estar presente
    expect(row.cliente_note).toBe('Te mando el video del evento');
  });

});
