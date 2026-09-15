/**
 * Unit tests — cron navi-purge-expired-media
 *
 * Verifica eliminación de storage + rows, skip de no-vencidos y manejo
 * de errores de storage sin borrar rows (evitar orphaned DB entries).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks hoisted ───────────────────────────────────────────────────────────

const {
  mockVerifyCronAuth,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockVerifyCronAuth:    vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: mockVerifyCronAuth,
}));

import { GET } from '../purge-expired-media/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/purge-expired-media', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

const NOW = new Date('2026-09-15T04:00:00Z');

// Genera un signed URL de Supabase con path embebido
function makeSignedUrl(path: string): string {
  return `https://abc.supabase.co/storage/v1/object/sign/user-media/${path}?token=eyJhbGciOiJIUzI1NiJ9.test`;
}

function makeMedia(id: string, path: string, expired = true): Record<string, unknown> {
  const expiresAt = expired
    ? new Date(NOW.getTime() - 1000).toISOString()   // 1 segundo antes de NOW = vencido
    : new Date(NOW.getTime() + 3600 * 1000).toISOString(); // 1 hora después = válido
  return {
    id,
    file_url:   makeSignedUrl(path),
    expires_at: expiresAt,
  };
}

function buildSb(rows: unknown[], storageError: unknown = null, dbDeleteError: unknown = null) {
  const storageRemoveFn = vi.fn().mockResolvedValue({ error: storageError });
  const dbDeleteEqFn    = vi.fn().mockResolvedValue({ error: dbDeleteError });
  const dbDeleteInFn    = vi.fn().mockReturnValue({ error: dbDeleteError, then: undefined });
  const dbDeleteFn      = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: dbDeleteError }) });

  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'user_media_uploads') {
        return {
          select: vi.fn().mockReturnValue({
            lt:    vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
          }),
          delete: dbDeleteFn,
        };
      }
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }),
        update: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockResolvedValue({ error: null }),
      };
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        remove: storageRemoveFn,
      }),
    },
  };

  return { storageRemoveFn, dbDeleteFn, sb };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('navi-purge-expired-media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(true);
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── (a) Elimina storage y row para media vencida ─────────────────────────

  it('(a) elimina objeto de storage y row DB para media vencida', async () => {
    const media = makeMedia('media-1', 'org/agent/video.mp4');
    const { storageRemoveFn, dbDeleteFn, sb } = buildSb([media]);
    mockCreateAdminClient.mockReturnValue(sb);

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect(body.ok).toBe(true);
    expect(body.errors_count).toBe(0);
    expect((body.metadata as Record<string, number>).rows_deleted).toBe(1);
    expect((body.metadata as Record<string, number>).storage_objects_deleted).toBe(1);

    // storage.from('user-media').remove([path])
    expect(storageRemoveFn).toHaveBeenCalledWith(['org/agent/video.mp4']);

    // DB delete
    expect(dbDeleteFn).toHaveBeenCalled();
  });

  // ── (b) No borra media no vencida (el SELECT la excluye) ─────────────────

  it('(b) query retorna vacío si no hay media vencida', async () => {
    // La query ya filtra por expires_at < now() — si no hay vencidos, rows = []
    const { storageRemoveFn, dbDeleteFn, sb } = buildSb([]);
    mockCreateAdminClient.mockReturnValue(sb);

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect(body.ok).toBe(true);
    expect((body.metadata as Record<string, number>).rows_deleted).toBe(0);
    expect((body.metadata as Record<string, number>).storage_objects_deleted).toBe(0);
    expect(storageRemoveFn).not.toHaveBeenCalled();
    expect(dbDeleteFn).not.toHaveBeenCalled();
  });

  // ── (c) Error de storage → row NO se borra, error se reporta ─────────────

  it('(c) error en storage.remove → row no se borra, error_count=1', async () => {
    const media = makeMedia('media-err', 'org/agent/vid2.mp4');
    const { storageRemoveFn, dbDeleteFn, sb } = buildSb(
      [media],
      { message: 'NoSuchKey' }, // storage error
      null,
    );
    mockCreateAdminClient.mockReturnValue(sb);

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    // Error capturado en errors array
    expect(body.errors_count).toBe(1);
    // Storage se intentó pero falló
    expect(storageRemoveFn).toHaveBeenCalled();
    // DB delete NO se llamó (evitar orphaned row)
    expect(dbDeleteFn).not.toHaveBeenCalled();
    // rows_deleted = 0
    expect((body.metadata as Record<string, number>).rows_deleted).toBe(0);
  });
});
