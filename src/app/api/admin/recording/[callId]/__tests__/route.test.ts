/**
 * Tests para GET /api/admin/recording/[callId].
 *
 * Verifica la preferencia storage → fallback Vapi:
 *  - Storage path presente + signed URL OK → redirect a signed URL
 *  - Storage path presente pero signing falla → fallback a Vapi
 *  - Storage path null pero vapi_call_id → fallback a Vapi
 *  - Ambos ausentes → 404
 *  - No admin → 401
 *  - Call no existe → 404
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockIsAdmin,
  mockCreateAdminClient,
  mockSignRecordingUrl,
} = vi.hoisted(() => ({
  mockIsAdmin:            vi.fn(),
  mockCreateAdminClient:  vi.fn(),
  mockSignRecordingUrl:   vi.fn(),
}));

vi.mock('@/lib/admin/auth', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/vapi/recordings', () => ({
  signRecordingUrl: mockSignRecordingUrl,
  // Re-export what the tested route imports — nothing else used here.
}));

import { GET } from '../route';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSupabaseMock(callRow: unknown) {
  const chainable = {
    select:      () => chainable,
    eq:          () => chainable,
    maybeSingle: async () => ({ data: callRow, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chainable) };
}

function makeReq() {
  return new Request('http://localhost/api/admin/recording/call-1') as unknown as Parameters<typeof GET>[0];
}

function makeParams(callId = 'call-1') {
  return { params: Promise.resolve({ callId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAPI_API_KEY = 'test-key';
  vi.stubGlobal('fetch', vi.fn());
});

// ─── Auth ───────────────────────────────────────────────────────────────────

describe('admin/recording — auth', () => {
  it('401 cuando no admin', async () => {
    mockIsAdmin.mockResolvedValue(false);
    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(401);
  });
});

// ─── Storage preference ────────────────────────────────────────────────────

describe('admin/recording — storage preference', () => {

  it('redirect a signed URL cuando recording_storage_path existe', async () => {
    mockIsAdmin.mockResolvedValue(true);
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock({
      id:                      'call-1',
      vapi_call_id:            'vapi-1',
      recording_storage_path:  'agent-1/call-1.mp3',
    }));
    mockSignRecordingUrl.mockResolvedValue('https://storage.example/signed/xyz');

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://storage.example/signed/xyz');
    // No debe llamar a Vapi cuando storage sirve.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fallback a Vapi cuando signing del storage falla', async () => {
    mockIsAdmin.mockResolvedValue(true);
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock({
      id:                      'call-1',
      vapi_call_id:            'vapi-1',
      recording_storage_path:  'agent-1/call-1.mp3',
    }));
    mockSignRecordingUrl.mockResolvedValue(null); // signing fail
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ artifact: { recordingUrl: 'https://vapi/fresh.mp3' } }),
    });

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://vapi/fresh.mp3');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.vapi.ai/call/vapi-1',
      expect.any(Object),
    );
  });

  it('fallback a Vapi cuando storage_path es null', async () => {
    mockIsAdmin.mockResolvedValue(true);
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock({
      id:                      'call-1',
      vapi_call_id:            'vapi-1',
      recording_storage_path:  null,
    }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ artifact: { recordingUrl: 'https://vapi/fresh.mp3' } }),
    });

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(302);
    expect(mockSignRecordingUrl).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalled();
  });

  it('404 cuando call no existe', async () => {
    mockIsAdmin.mockResolvedValue(true);
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock(null));

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(404);
  });

  it('404 cuando ni storage_path ni vapi_call_id', async () => {
    mockIsAdmin.mockResolvedValue(true);
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock({
      id:                      'call-1',
      vapi_call_id:            null,
      recording_storage_path:  null,
    }));

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(404);
  });

  it('404 cuando Vapi tampoco tiene recording (llamada expirada)', async () => {
    mockIsAdmin.mockResolvedValue(true);
    mockCreateAdminClient.mockReturnValue(makeSupabaseMock({
      id:                      'call-1',
      vapi_call_id:            'vapi-1',
      recording_storage_path:  null,
    }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ artifact: {} }),
    });

    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(404);
  });

});
