/**
 * Tests de comportamiento para POST /api/portal/[token]/agent-chat/upload
 *
 * Casos cubiertos:
 *   (a) Camino feliz → 200 con media_id y source='chat'
 *   (b) Sin cookie de sesión → 401
 *   (c) agent_id de otra org (IDOR fail) → 403
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

const PORTAL_EMAIL = 'nazre20+navi-media-chat@gmail.com';
const ORG_TOKEN    = 'org-tok-chat-abc';
const AGENT_ID     = 'agent-uuid-chat-001';
const ROW_ID       = 'row-uuid-chat-001';
const SIGNED_URL   = 'https://cdn.example.com/user-media/chat-img.jpg?tok=abc';

const INSERTED_ROW = {
  id:              ROW_ID,
  portal_email:    PORTAL_EMAIL,
  agent_id:        AGENT_ID,
  source:          'chat',
  file_url:        SIGNED_URL,
  file_type:       'image/jpeg',
  file_size_bytes: 512,
  status:          'available',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSupabaseMock(opts: { agentFound?: boolean } = {}) {
  const { agentFound = true } = opts;

  const agentResult = agentFound
    ? { data: { id: AGENT_ID, portal_email: PORTAL_EMAIL }, error: null }
    : { data: null, error: null };

  const fromMock = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.select      = (_c?: string) => chain;
    chain.eq          = (_k: string, _v: unknown) => chain;
    chain.maybeSingle = async () => agentResult;
    chain.insert      = (_data: unknown) => ({
      select: () => ({
        single: async () => ({ data: INSERTED_ROW, error: null }),
      }),
    });
    return chain;
  });

  const storageMock = {
    from: vi.fn(() => ({
      upload:          vi.fn(async () => ({ error: null })),
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: SIGNED_URL }, error: null })),
    })),
  };

  return { from: fromMock, storage: storageMock };
}

function makeUploadRequest(opts: {
  agentId?:    string;
  withCookie?: boolean;
  token?:      string;
} = {}): NextRequest {
  const {
    agentId    = AGENT_ID,
    withCookie = true,
    token      = ORG_TOKEN,
  } = opts;

  const form = new FormData();
  const blob = new Blob([new Uint8Array(512).fill(7)], { type: 'image/jpeg' });
  form.append('file', new File([blob], 'chat-img.jpg', { type: 'image/jpeg' }));
  form.append('agent_id', agentId);

  return new NextRequest(`https://www.centinelia.mx/api/portal/${token}/agent-chat/upload`, {
    method:  'POST',
    body:    form,
    headers: withCookie ? { cookie: 'Centinelia_portal=valid-session' } : {},
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/portal/[token]/agent-chat/upload', () => {

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

  // (a) Camino feliz → 200 con media_id y source='chat'
  it('(a) imagen válida en chat → 200 con media_id y source=chat en la fila', async () => {
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock());

    const req = makeUploadRequest();
    const res = await POST(req, { params: Promise.resolve({ token: ORG_TOKEN }) });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    // Debe devolver media_id para que el chat lo use en el siguiente mensaje
    expect(body.media_id).toBe(ROW_ID);
    const media = body.media as Record<string, unknown>;
    expect(media.source).toBe('chat');
    expect(media.portal_email).toBe(PORTAL_EMAIL);
  });

  // (b) Sin cookie de sesión → 401
  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = makeUploadRequest({ withCookie: false });
    const res = await POST(req, { params: Promise.resolve({ token: ORG_TOKEN }) });

    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  // (c) IDOR: agent_id no pertenece a esta org → 403
  it('(c) agent_id de otra org → 403', async () => {
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock({ agentFound: false }));

    const req = makeUploadRequest({ agentId: 'agent-de-otra-org-xyz' });
    const res = await POST(req, { params: Promise.resolve({ token: ORG_TOKEN }) });

    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toMatch(/sin acceso|no encontrado/i);
  });

});
