/**
 * Tests para downloadAndStoreVapiRecording + signRecordingUrl.
 *
 * Regression: antes de este helper el webhook solo guardaba la URL de Vapi
 * en voice_calls.recording_url. Vapi expira ese archivo a los pocos días, y
 * los endpoints /api/{admin,portal}/recording pedían la URL fresca vía Vapi
 * API; cuando Vapi ya no la tenía, 404. Ahora bajamos el mp3 y lo servimos
 * desde storage propio (90d).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  buildRecordingPath,
  downloadAndStoreVapiRecording,
  signRecordingUrl,
  CALL_RECORDINGS_BUCKET,
} from '../recordings';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AGENT_ID = 'agent-uuid-1';
const CALL_ID  = 'call-uuid-1';
const VAPI_MP3_URL = 'https://vapi-storage.example/mp3/xyz.mp3';

function makeStorageMock(overrides: {
  uploadError?: string | null;
  signedUrl?:   string | null;
  signError?:   string | null;
} = {}) {
  const upload = vi.fn().mockResolvedValue({
    data:  { path: 'ok' },
    error: overrides.uploadError ? { message: overrides.uploadError } : null,
  });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data:  overrides.signedUrl !== undefined
      ? (overrides.signedUrl === null ? null : { signedUrl: overrides.signedUrl })
      : { signedUrl: 'https://storage.example/signed/xyz.mp3' },
    error: overrides.signError ? { message: overrides.signError } : null,
  });
  return {
    upload,
    createSignedUrl,
    supabase: {
      storage: {
        from: vi.fn().mockReturnValue({
          upload,
          createSignedUrl,
        }),
      },
    } as unknown as Parameters<typeof downloadAndStoreVapiRecording>[0]['supabase'],
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── buildRecordingPath ─────────────────────────────────────────────────────

describe('buildRecordingPath', () => {
  it('formats as {agent_id}/{voice_call_id}.mp3', () => {
    expect(buildRecordingPath(AGENT_ID, CALL_ID)).toBe(`${AGENT_ID}/${CALL_ID}.mp3`);
  });
});

// ─── downloadAndStoreVapiRecording ─────────────────────────────────────────

describe('downloadAndStoreVapiRecording', () => {

  it('returns null when recordingUrl is null (no throw)', async () => {
    const m = makeStorageMock();
    const result = await downloadAndStoreVapiRecording({
      supabase:     m.supabase,
      agentId:      AGENT_ID,
      voiceCallId:  CALL_ID,
      recordingUrl: null,
    });
    expect(result).toBeNull();
    expect(m.upload).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('downloads mp3 and uploads to call-recordings bucket on happy path', async () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => buf.buffer,
    });
    const m = makeStorageMock();

    const result = await downloadAndStoreVapiRecording({
      supabase:     m.supabase,
      agentId:      AGENT_ID,
      voiceCallId:  CALL_ID,
      recordingUrl: VAPI_MP3_URL,
    });

    expect(result).toBe(`${AGENT_ID}/${CALL_ID}.mp3`);
    expect(fetch).toHaveBeenCalledWith(VAPI_MP3_URL);
    const storageFrom = m.supabase.storage.from as ReturnType<typeof vi.fn>;
    expect(storageFrom).toHaveBeenCalledWith(CALL_RECORDINGS_BUCKET);
    expect(m.upload).toHaveBeenCalledWith(
      `${AGENT_ID}/${CALL_ID}.mp3`,
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'audio/mpeg', upsert: true }),
    );
  });

  it('returns null when fetch fails (no throw, no upload)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const m = makeStorageMock();

    const result = await downloadAndStoreVapiRecording({
      supabase:     m.supabase,
      agentId:      AGENT_ID,
      voiceCallId:  CALL_ID,
      recordingUrl: VAPI_MP3_URL,
    });

    expect(result).toBeNull();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('returns null when fetch throws (network error)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNRESET'));
    const m = makeStorageMock();

    const result = await downloadAndStoreVapiRecording({
      supabase:     m.supabase,
      agentId:      AGENT_ID,
      voiceCallId:  CALL_ID,
      recordingUrl: VAPI_MP3_URL,
    });

    expect(result).toBeNull();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('returns null when body is empty (guards against Vapi returning nothing)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const m = makeStorageMock();

    const result = await downloadAndStoreVapiRecording({
      supabase:     m.supabase,
      agentId:      AGENT_ID,
      voiceCallId:  CALL_ID,
      recordingUrl: VAPI_MP3_URL,
    });

    expect(result).toBeNull();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('returns null when Supabase upload fails (no throw)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    const m = makeStorageMock({ uploadError: 'permission denied' });

    const result = await downloadAndStoreVapiRecording({
      supabase:     m.supabase,
      agentId:      AGENT_ID,
      voiceCallId:  CALL_ID,
      recordingUrl: VAPI_MP3_URL,
    });

    expect(result).toBeNull();
    expect(m.upload).toHaveBeenCalledTimes(1);
  });

});

// ─── signRecordingUrl ───────────────────────────────────────────────────────

describe('signRecordingUrl', () => {

  it('returns signed URL on happy path', async () => {
    const m = makeStorageMock({ signedUrl: 'https://storage.example/signed/abc' });
    const url = await signRecordingUrl(m.supabase, `${AGENT_ID}/${CALL_ID}.mp3`);
    expect(url).toBe('https://storage.example/signed/abc');
  });

  it('returns null when Supabase signing fails', async () => {
    const m = makeStorageMock({ signError: 'not found' });
    const url = await signRecordingUrl(m.supabase, `${AGENT_ID}/${CALL_ID}.mp3`);
    expect(url).toBeNull();
  });

  it('returns null when signed URL is missing from response', async () => {
    const m = makeStorageMock({ signedUrl: null });
    const url = await signRecordingUrl(m.supabase, `${AGENT_ID}/${CALL_ID}.mp3`);
    expect(url).toBeNull();
  });

});
