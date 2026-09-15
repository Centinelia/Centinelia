/**
 * Tests para GET /api/portal/[token]/recording/[callId].
 *
 * Verifica auth por sesión + acceso al agent, y preferencia storage → Vapi.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockVerifySession,
  mockGetAgentAccess,
  mockCreateAdminClient,
  mockSignRecordingUrl,
} = vi.hoisted(() => ({
  mockVerifySession:      vi.fn(),
  mockGetAgentAccess:     vi.fn(),
  mockCreateAdminClient:  vi.fn(),
  mockSignRecordingUrl:   vi.fn(),
}));

vi.mock('@/lib/portal/auth', () => ({
  verifySession: mockVerifySession,
  PORTAL_COOKIE: 'Centinelia_portal',
}));

vi.mock('@/lib/portal/agent-access', () => ({
  getAgentAccess: mockGetAgentAccess,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/vapi/recordings', () => ({
  signRecordingUrl: mockSignRecordingUrl,
}));

import { GET } from '../route';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSupabaseMock(callRow: unknown) {
  const chainable = {
    select:      () => chainable,
    eq:          () => chainable,
    in:          () => chainable,
    maybeSingle: async () => ({ data: callRow, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chainable) };
}

function makeReq() {
  return new NextRequest('http://localhost/api/portal/tok/recording/call-1', {
    headers: { cookie: 'Centinelia_portal=valid-cookie' },
  });
}

function makeParams(token = 'tok', callId = 'call-1') {
  return { params: Promise.resolve({ token, callId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAPI_API_KEY = 'test-key';
  vi.stubGlobal('fetch', vi.fn());
});

// ─── Auth ───────────────────────────────────────────────────────────────────

describe('portal/recording — auth', () => {
  it('401 sin sesión válida', async () => {
    mockVerifySession.mockResolvedValue(null);

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(401);
  });

  it('403 sin agent access', async () => {
    mockVerifySession.mockResolvedValue({ portalEmail: 'x@y.com' });
    mockGetAgentAccess.mockResolvedValue(null);

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(403);
  });

  it('403 cuando portalEmail de sesión no coincide', async () => {
    mockVerifySession.mockResolvedValue({ portalEmail: 'session@y.com' });
    mockGetAgentAccess.mockResolvedValue({
      ids: ['agent-1'], primaryId: 'agent-1', portalEmail: 'other@y.com',
    });

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(403);
  });
});

// ─── Storage preference ────────────────────────────────────────────────────

describe('portal/recording — storage preference', () => {

  beforeEach(() => {
    mockVerifySession.mockResolvedValue({ portalEmail: 'x@y.com' });
    mockGetAgentAccess.mockResolvedValue({
      ids: ['agent-1'], primaryId: 'agent-1', portalEmail: 'x@y.com',
    });
  });

  it('redirect a signed URL cuando recording_storage_path existe', async () => {
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock({
      id:                      'call-1',
      agent_id:                'agent-1',
      vapi_call_id:            'vapi-1',
      recording_storage_path:  'agent-1/call-1.mp3',
    }));
    mockSignRecordingUrl.mockResolvedValue('https://storage.example/signed');

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://storage.example/signed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fallback a Vapi cuando storage_path es null pero vapi_call_id existe', async () => {
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock({
      id:                      'call-1',
      agent_id:                'agent-1',
      vapi_call_id:            'vapi-1',
      recording_storage_path:  null,
    }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ artifact: { recordingUrl: 'https://vapi/fresh.mp3' } }),
    });

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://vapi/fresh.mp3');
    expect(mockSignRecordingUrl).not.toHaveBeenCalled();
  });

  it('404 cuando call no existe / no accesible', async () => {
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock(null));

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(404);
  });

  it('404 cuando ni storage_path ni vapi_call_id', async () => {
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock({
      id:                      'call-1',
      agent_id:                'agent-1',
      vapi_call_id:            null,
      recording_storage_path:  null,
    }));

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(404);
  });

});
