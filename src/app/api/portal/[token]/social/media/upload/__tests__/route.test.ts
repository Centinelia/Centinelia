/**
 * Tests de comportamiento para POST /api/portal/[token]/social/media/upload
 *
 * Casos cubiertos:
 *   (a) Camino feliz: sesión válida + agent_id de la misma org → 200 con fila registrada
 *   (b) Sin cookie de sesión → 401
 *   (c) agent_id pertenece a otra org → 403
 *   (d) Archivo demasiado grande (mock del tamaño) → 413
 *
 * Supabase y auth completamente mockeados — sin hits reales.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

const {
  mockVerifySession,
  mockResolveOrg,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockVerifySession:     vi.fn(),
  mockResolveOrg:        vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@/lib/portal/auth', () => ({
  verifySession: mockVerifySession,
  PORTAL_COOKIE: 'Centinelia_portal',
}));

vi.mock('@/lib/portal/org-token', () => ({
  resolveOrgFromToken: mockResolveOrg,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

import { POST } from '../route';

// ─── Constantes ────────────────────────────────────────────────────────────────

const PORTAL_EMAIL  = 'nazre20+navi-media-upload@gmail.com';
const ORG_TOKEN     = 'org-tok-upload-abc';
const AGENT_ID      = 'agent-uuid-media-001';
const OTHER_AGENT   = 'agent-uuid-other-org-999';
const SIGNED_URL    = 'https://cdn.example.com/user-media/img.jpg?tok=xyz';
const INSERTED_ROW  = {
  id:              'row-uuid-001',
  portal_email:    PORTAL_EMAIL,
  agent_id:        AGENT_ID,
  source:          'portal_upload',
  file_url:        SIGNED_URL,
  file_type:       'image/jpeg',
  file_size_bytes: 1024,
  status:          'available',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Crea un mock de Supabase con storage + from controlables. */
function makeSupabaseMock(opts: {
  agentFound?:     boolean;
  agentPortalEmail?: string;
  uploadError?:    string;
  signedUrlError?: string;
  insertError?:    string;
  insertedRow?:    unknown;
} = {}) {
  const {
    agentFound       = true,
    agentPortalEmail = PORTAL_EMAIL,
    uploadError,
    signedUrlError,
    insertedRow      = INSERTED_ROW,
    insertError,
  } = opts;

  // Cola de resultados para from().select()...maybeSingle()
  const results: Array<{ data: unknown; error: unknown }> = [];
  // Cola para insert().select().single()
  const insertResults: Array<{ data: unknown; error: unknown }> = [];

  if (agentFound) {
    results.push({ data: { id: AGENT_ID, portal_email: agentPortalEmail }, error: null });
  } else {
    results.push({ data: null, error: null });
  }

  insertResults.push({
    data:  insertError ? null : insertedRow,
    error: insertError ? { message: insertError } : null,
  });

  const storageMock = {
    from: vi.fn(() => ({
      upload: vi.fn(async () =>
        uploadError ? { error: { message: uploadError } } : { error: null },
      ),
      createSignedUrl: vi.fn(async () =>
        signedUrlError
          ? { data: null, error: { message: signedUrlError } }
          : { data: { signedUrl: SIGNED_URL }, error: null },
      ),
    })),
  };

  const fromMock = vi.fn(() => {
    // Cada llamada consume el próximo resultado de la cola
    const chain: Record<string, unknown> = {};

    chain.select      = (_c?: string) => chain;
    chain.eq          = (_k: string, _v: unknown) => chain;
    chain.maybeSingle = async () => results.shift() ?? { data: null, error: null };
    chain.insert      = (_data: unknown) => ({
      select: () => ({
        single: async () => insertResults.shift() ?? { data: null, error: { message: 'vacío' } },
      }),
    });

    return chain;
  });

  return { storage: storageMock, from: fromMock };
}

/** Crea un NextRequest multipart con una imagen pequeña. */
function makeUploadRequest(opts: {
  agentId?:     string;
  fileType?:    string;
  fileSize?:    number;
  withCookie?:  boolean;
  token?:       string;
} = {}): NextRequest {
  const {
    agentId    = AGENT_ID,
    fileType   = 'image/jpeg',
    fileSize   = 1024,
    withCookie = true,
    token      = ORG_TOKEN,
  } = opts;

  const form = new FormData();
  // Crear un Blob con el tipo y tamaño indicados
  const blob = new Blob([new Uint8Array(fileSize).fill(42)], { type: fileType });
  form.append('file', new File([blob], 'test-image.jpg', { type: fileType }));
  form.append('agent_id', agentId);
  form.append('cliente_note', 'Nota de prueba');

  return new NextRequest(`https://www.centinelia.mx/api/portal/${token}/social/media/upload`, {
    method:  'POST',
    body:    form,
    headers: withCookie ? { cookie: `Centinelia_portal=valid-session` } : {},
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/portal/[token]/social/media/upload', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');

    mockVerifySession.mockResolvedValue({
      portalEmail: PORTAL_EMAIL,
      isSubUser:   false,
    });

    mockResolveOrg.mockResolvedValue({
      portalEmail: PORTAL_EMAIL,
      orgToken:    ORG_TOKEN,
      legacy:      false,
    });
  });

  // (a) Camino feliz
  it('(a) imagen válida + sesión correcta → 200 con fila media registrada', async () => {
    const supabase = makeSupabaseMock();
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = makeUploadRequest();
    const res = await POST(req, { params: Promise.resolve({ token: ORG_TOKEN }) });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.media).toBeDefined();
    const media = body.media as Record<string, unknown>;
    expect(media.source).toBe('portal_upload');
    expect(media.portal_email).toBe(PORTAL_EMAIL);
  });

  // (b) Sin cookie de sesión → 401
  it('(b) sin cookie de sesión → 401', async () => {
    // En producción, verifySession retorna null sin sesión válida
    mockVerifySession.mockResolvedValue(null);

    const req = makeUploadRequest({ withCookie: false });
    const res = await POST(req, { params: Promise.resolve({ token: ORG_TOKEN }) });

    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  // (c) agent_id de otra org → 403
  it('(c) agent_id pertenece a otra org → 403', async () => {
    // El agente existe pero con otro portal_email
    const supabase = makeSupabaseMock({ agentFound: false });
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = makeUploadRequest({ agentId: OTHER_AGENT });
    const res = await POST(req, { params: Promise.resolve({ token: ORG_TOKEN }) });

    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toMatch(/sin acceso|no encontrado/i);
  });

  // (d) Archivo demasiado grande → 413
  // Estrategia: creamos un NextRequest real y sobreescribimos formData() en la
  // instancia para devolver un File cuyo tamaño supera el límite, sin alojar
  // 30 MB en memoria.
  it('(d) imagen que supera 30 MB → 413', async () => {
    const supabase = makeSupabaseMock();
    mockCreateAdminClient.mockReturnValue(supabase);

    // File con size falsificado (tiny bytes, size reportado como 35 MB)
    const bigFile = new File([new Uint8Array(10)], 'grande.jpg', { type: 'image/jpeg' });
    Object.defineProperty(bigFile, 'size', { value: 35 * 1024 * 1024, configurable: true });

    const req = new NextRequest(
      `https://www.centinelia.mx/api/portal/${ORG_TOKEN}/social/media/upload`,
      {
        method:  'POST',
        body:    new Uint8Array(0), // body vacío — sobreescribimos formData abajo
        headers: { cookie: 'Centinelia_portal=valid-session', 'content-type': 'multipart/form-data; boundary=x' },
      },
    );

    // Sobreescribir formData() en la instancia para devolver nuestro file falso
    Object.defineProperty(req, 'formData', {
      value: async () => {
        const fd = new FormData();
        fd.append('file', bigFile);
        fd.append('agent_id', AGENT_ID);
        return fd;
      },
      writable:     true,
      configurable: true,
    });

    const res = await POST(req, { params: Promise.resolve({ token: ORG_TOKEN }) });

    expect(res.status).toBe(413);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toMatch(/30 MB/i);
  });

});
